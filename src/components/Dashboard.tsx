'use client';

import { useMemo, useRef, useState } from 'react';
import styles from './Dashboard.module.css';
import Masthead from './Masthead';
import StatTiles from './StatTiles';
import ClaimsTable from './ClaimsTable';
import ClaimsCard from './ClaimsCard';
import ActionConfirmOverlay from './ActionConfirmOverlay';
import WorkflowDiagramModal from './WorkflowDiagramModal';
import { Shade, ModalLayer } from './Modal';
import SettingsPanel, { type AppearanceStyle, type AppearanceTheme } from './SettingsPanel';
import AnchorPanel from './AnchorPanel';
import { useExitAnimation } from './useExitAnimation';
import { getCurrentClaimState } from '../lib/persistence/claim-state';
import { appendAuditEntry, getAuditLogForClaim } from '../lib/persistence/local-store';
import { submitHumanAction, submitPostTerminalAction } from '../lib/humangate/actions';
import { computeBulkBarState, type QueueStep } from '../lib/ui/bulk-actions';
import type { DashboardClaimRow } from '../lib/ui/dashboard-rows';
import type { ModelProvider } from '../lib/pipeline/model-client';
import type { HumanActionType, PostTerminalAction, AuditLogEntry } from '../lib/humangate/types';
import type { ClaimStatus } from '../lib/rules/status';
import type { SeverityBand } from '../lib/rules/severity';

// approve_with_edit is excluded — ActionConfirmOverlay has no variant for it
// yet, and no button in this build ever dispatches it. 'note' is the
// free-form audit-log entry, added alongside its own overlay variant.
type OverlayAction = Exclude<HumanActionType, 'approve_with_edit'> | PostTerminalAction | 'note';
// Carries claimId rather than a row snapshot, so the active row is always
// looked up fresh against displayRows below — a snapshot taken at the
// moment the card opened would go stale the instant a pending action
// commits or cancels mid-session, showing the wrong status right after the
// adjuster's own action resolved.
type ModalState = { layer: 'none' } | { layer: 'card'; claimId: string } | { layer: 'overlay'; claimId: string; action: OverlayAction };

// A staged-but-not-yet-persisted action, live only in memory for the
// duration of the grace window (project-spec.txt Section 4c, added
// 2026-08-04). Nothing here touches localStorage until commitPending()
// actually runs — a cancel within the window just discards this and the
// claim reverts to whatever getCurrentClaimState() already says, with no
// audit-log trace of the action ever having been attempted.
interface PendingCommit {
  claimId: string;
  entry: AuditLogEntry;
  displayStatus: ClaimStatus;
  displaySeverity: SeverityBand;
}

const STYLE_KEY = 'claimsdock:style';
const THEME_KEY = 'claimsdock:theme';
const PROVIDER_KEY = 'claimsdock:anchor-provider';
const FADE_OUT_MS = 320;
// project-spec.txt Section 4c (added 2026-08-04) — the uniform grace-window
// undo affordance on every action's confirm screen.
const GRACE_WINDOW_MS = 4200;

export default function Dashboard({ rows }: { rows: DashboardClaimRow[] }) {
  // Read once, lazily — SSR has no localStorage (window is undefined there),
  // so the initial server render always uses the default; the client's own
  // first render reads the real saved value. No effect needed: nothing here
  // is visible until Settings is opened, so there's no hydration flash to
  // guard against between the two.
  const [style, setStyle] = useState<AppearanceStyle>(
    () => (typeof window !== 'undefined' && (localStorage.getItem(STYLE_KEY) as AppearanceStyle)) || 'ledger',
  );
  const [theme, setTheme] = useState<AppearanceTheme>(
    () => (typeof window !== 'undefined' && (localStorage.getItem(THEME_KEY) as AppearanceTheme)) || 'light',
  );
  // Kimi is the default — matches the Pipeline's own current provider choice
  // (cache.ts) and is the cheaper option, so it's what a first-time visitor
  // gets before ever touching this control.
  const [provider, setProvider] = useState<ModelProvider>(
    () => (typeof window !== 'undefined' && (localStorage.getItem(PROVIDER_KEY) as ModelProvider)) || 'kimi',
  );
  const [modal, setModal] = useState<ModalState>({ layer: 'none' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diagramOpen, setDiagramOpen] = useState(false);
  // True only for the brief window openLinkedClaim spends at layer:'none'
  // between closing the old card and mounting the new one — keeps the shade
  // out of that cycle so it stays solidly up throughout the swap; only the
  // card content itself should fade out then in.
  const [switchingCard, setSwitchingCard] = useState(false);

  // The one active grace-window action, if any (project-spec.txt Section
  // 4c) — held entirely in memory, never touching localStorage until
  // commitPending() actually runs. Only one action can be pending at a time
  // in this UI (the overlay that started it is still open), so a single
  // slot is enough — no need for a map keyed by claim.
  const [pending, setPendingState] = useState<PendingCommit | null>(null);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `pending`, updated synchronously — commitPending reads this
  // rather than `pending` itself, since the timeout callback closes over
  // whatever `pending` was at the render where it was scheduled (stale by
  // the time it fires) and a functional setState updater isn't safe here
  // either: putting appendAuditEntry's side effect inside one caused a real,
  // confirmed double-write, since Strict Mode intentionally double-invokes
  // updater functions in development to catch exactly that kind of impurity.
  const pendingRef = useRef<PendingCommit | null>(null);
  function setPending(next: PendingCommit | null) {
    pendingRef.current = next;
    setPendingState(next);
  }
  // Bumped on commit so displayRows re-derives from localStorage even
  // though appendAuditEntry's own write isn't itself reactive state.
  const [refreshKey, setRefreshKey] = useState(0);

  // A bulk sequential queue (Request Additional Info, any Reverse action —
  // 2026-08-06, see lib/ui/bulk-actions.ts): the note-required bulk actions
  // can't commit instantly like Approve/Escalate, so this opens each
  // selected claim's own existing overlay in turn via the same modal
  // machinery a single click already uses. `null` means no queue is
  // running; an array (possibly empty) holds whatever's left AFTER the
  // currently-open step. Plain ref, not state — nothing needs to re-render
  // off the queue itself, only off `modal` (already reactive), and this
  // also sidesteps the same stale-closure risk `pending` has: the 4.2s
  // timer can call finishOverlayAction from a render long past.
  const queueRef = useRef<QueueStep[] | null>(null);
  function setQueue(next: QueueStep[] | null) {
    queueRef.current = next;
  }

  function startQueue(steps: QueueStep[]) {
    if (steps.length === 0) return;
    const [first, ...rest] = steps;
    setQueue(rest);
    setModal({ layer: 'overlay', claimId: first.claimId, action: first.action });
  }

  function stagePending(claimId: string, result: { status: ClaimStatus; severity: SeverityBand; auditEntry: AuditLogEntry }) {
    setPending({ claimId, entry: result.auditEntry, displayStatus: result.status, displaySeverity: result.severity });
    pendingTimer.current = setTimeout(commitPending, GRACE_WINDOW_MS);
  }
  // Runs once a claim's action has actually resolved (committed or
  // cancelled) — either continues a bulk queue by opening the next claim's
  // own overlay, or falls back to the original single-action behavior
  // (return to that claim's card). A functional setModal update
  // (side-effect-free, so Strict Mode's double-invoke is harmless) rather
  // than reading the `modal` closure directly, since this runs from the
  // 4.2s timer too, whose closure is stale by the time it fires. Missing
  // this for the timer path specifically was a real bug, found live
  // 2026-08-05: an auto-committed action persisted correctly but left the
  // confirm screen on-screen indefinitely, since only the Dismiss button's
  // own handler used to close the overlay.
  function finishOverlayAction(claimId: string | undefined) {
    if (claimId === undefined) return;
    const remaining = queueRef.current;
    if (remaining === null) {
      setModal((m) => (m.layer === 'overlay' && m.claimId === claimId ? { layer: 'card', claimId } : m));
      return;
    }
    if (remaining.length === 0) {
      setQueue(null);
      // Selection stays alive for the whole queue, not just until it
      // starts — cleared here, once the *last* step actually resolves, not
      // the instant the bulk button was clicked. Found live 2026-08-06:
      // clearing it immediately meant the checkboxes visually disappeared
      // and Anchor lost all reference to "these claims" for the entire rest
      // of a multi-claim queue, even though nothing had finished yet.
      setSelectedClaimIds(new Set());
      closeAll();
      return;
    }
    const [next, ...rest] = remaining;
    setQueue(rest);
    setModal({ layer: 'overlay', claimId: next.claimId, action: next.action });
  }
  // Shared by both the timer firing and a Dismiss click — per the confirmed
  // design, Dismiss ends the window early rather than leaving a background
  // timer running after the overlay's already closed.
  function commitPending() {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    const current = pendingRef.current;
    if (current) appendAuditEntry(current.entry);
    setPending(null);
    setRefreshKey((k) => k + 1);
    finishOverlayAction(current?.claimId);
  }
  function cancelPending() {
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
    const current = pendingRef.current;
    setPending(null);
    finishOverlayAction(current?.claimId);
  }

  // Merges each row's real persisted state (localStorage's own audit log,
  // via getCurrentClaimState — Phase 7, never previously wired to the UI)
  // over the server-computed Pipeline baseline, then layers the one pending
  // grace-window action on top if it applies to that claim. This is the
  // array every other component below reads — not the raw `rows` prop —
  // since that prop only ever reflects the Pipeline's own output with no
  // awareness a human has ever acted on a claim.
  const displayRows = useMemo(() => {
    return rows.map((row) => {
      const current = getCurrentClaimState(row.claim, row.result);
      const status = pending?.claimId === row.claim.claim_id ? pending.displayStatus : current.status;
      const severity = pending?.claimId === row.claim.claim_id ? pending.displaySeverity : current.severity;
      if (status === row.status && severity === row.severity) return row;
      return { ...row, status, severity };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey is a deliberate re-derive trigger, not a value read below.
  }, [rows, pending, refreshKey]);

  // Checkbox selection, lifted out of ClaimsTable (2026-08-06) — both the
  // bulk-actions bar and Anchor's own awareness of a checkbox selection
  // need this above ClaimsTable, not just inside it.
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());
  const selectedRows = useMemo(
    () => displayRows.filter((r) => selectedClaimIds.has(r.claim.claim_id)),
    [displayRows, selectedClaimIds],
  );
  const bulkBarState = useMemo(() => computeBulkBarState(selectedRows), [selectedRows]);

  // Approve/Escalate/Cancel-Recoupment-Request commit immediately per claim
  // — no grace window, no stacked countdowns. Safe to do instantly (unlike
  // a single-claim action) because the bulk bar only ever offers one of
  // these when every selected claim already agrees on that exact
  // recommendation/status — a mismatch is structurally impossible here.
  function runInstantBulkAction(action: 'approve' | 'escalate' | 'undo_recoupment') {
    for (const row of selectedRows) {
      const result =
        action === 'undo_recoupment'
          ? submitPostTerminalAction(row.claim, row.result, getAuditLogForClaim(row.claim.claim_id), {
              claimId: row.claim.claim_id,
              action: 'undo_recoupment',
            })
          : submitHumanAction(row.claim, row.result, { claimId: row.claim.claim_id, action });
      appendAuditEntry(result.auditEntry);
    }
    setRefreshKey((k) => k + 1);
    setSelectedClaimIds(new Set());
  }

  function runBulkAction() {
    if (bulkBarState.kind === 'instant') {
      runInstantBulkAction(bulkBarState.action);
    } else if (bulkBarState.kind === 'queue') {
      // Selection is left as-is here on purpose — the queue is only just
      // starting, not finished; finishOverlayAction clears it once the last
      // step actually resolves (see its own comment).
      startQueue(bulkBarState.steps);
    }
  }

  // Persists the instant it changes — no Save step, no staged/uncommitted
  // state to revert on Cancel, since there's nothing left uncommitted.
  function changeStyle(next: AppearanceStyle) {
    setStyle(next);
    document.documentElement.setAttribute('data-style', next);
    localStorage.setItem(STYLE_KEY, next);
  }
  function changeTheme(next: AppearanceTheme) {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
  }
  function changeProvider(next: ModelProvider) {
    setProvider(next);
    localStorage.setItem(PROVIDER_KEY, next);
  }

  const cardVisible = modal.layer === 'card' || modal.layer === 'overlay';
  const overlayVisible = modal.layer === 'overlay';
  const shadeVisible = modal.layer !== 'none' || switchingCard;

  const cardAnim = useExitAnimation(cardVisible, FADE_OUT_MS);
  const overlayAnim = useExitAnimation(overlayVisible, FADE_OUT_MS);
  const shadeAnim = useExitAnimation(shadeVisible, FADE_OUT_MS);
  const diagramAnim = useExitAnimation(diagramOpen, FADE_OUT_MS);
  const diagramShadeAnim = useExitAnimation(diagramOpen, FADE_OUT_MS);

  // Freezes the last real row/action through a close — without this, the
  // instant modal.layer flips to 'none' (or 'overlay' back to 'card'), the
  // fade-out would be animating a card with no data at all, since
  // cardAnim/overlayAnim now correctly keep `mounted: true` for the entire
  // fadeOutMs window (see useExitAnimation) rather than actually unmounting
  // partway through. Same "adjust state during render" pattern as that hook,
  // for the same reason: must resolve before this render is ever painted.
  // Looked up fresh against displayRows (not a snapshot) each render, so a
  // pending action committing or cancelling while the card's still open
  // shows the real, current status immediately rather than a stale one.
  const liveActiveRow = modal.layer !== 'none' ? displayRows.find((r) => r.claim.claim_id === modal.claimId) : undefined;
  const [displayedRow, setDisplayedRow] = useState<DashboardClaimRow | null>(null);
  const [displayedAction, setDisplayedAction] = useState<OverlayAction | null>(null);
  if (liveActiveRow && liveActiveRow !== displayedRow) {
    setDisplayedRow(liveActiveRow);
  }
  if (modal.layer === 'overlay' && modal.action !== displayedAction) {
    setDisplayedAction(modal.action);
  }
  const activeRow = displayedRow;
  const activeAction = displayedAction;

  function closeAll() {
    setModal({ layer: 'none' });
  }
  // Cancel from the input/warning/suggest phases (nothing staged yet) just
  // returns to the card. Dismiss/Cancel from the confirm phase (a pending
  // action exists) additionally commits or discards it — see
  // ActionConfirmOverlay's onDismissConfirm/onCancelPending props.
  function cancelOverlay() {
    if (modal.layer === 'overlay') setModal({ layer: 'card', claimId: modal.claimId });
  }
  function onShadeClick() {
    if (modal.layer === 'overlay') cancelOverlay();
    else closeAll();
  }

  function openCard(row: DashboardClaimRow) {
    setSettingsOpen(false);
    setModal({ layer: 'card', claimId: row.claim.claim_id });
  }

  // Fades the current card out, then swaps in the linked one as a fresh
  // mount once the fade-out finishes — closing and reopening the same
  // layer is what makes the fade-in actually replay (changing props on the
  // same mounted instance wouldn't re-trigger a mount animation).
  function openLinkedClaim(claimId: string) {
    const linkedRow = displayRows.find((r) => r.claim.claim_id === claimId);
    if (!linkedRow) return;
    setSwitchingCard(true);
    setModal({ layer: 'none' });
    setTimeout(() => {
      setModal({ layer: 'card', claimId: linkedRow.claim.claim_id });
      setSwitchingCard(false);
    }, FADE_OUT_MS);
  }

  const providerNames = Array.from(new Set(rows.map((r) => r.providerName)));

  // Shade sits just below whichever layer is currently topmost — card (z=20)
  // normally, or above the card (z=40) once a confirmation overlay opens —
  // so the two never stack into a double-dark backdrop.
  const shadeZ = overlayVisible || overlayAnim.closing ? 40 : 20;

  return (
    <div className={styles.page}>
      <Masthead onOpenSettings={() => setSettingsOpen((o) => !o)} />
      <SettingsPanel
        open={settingsOpen}
        style={style}
        theme={theme}
        provider={provider}
        onStyleChange={changeStyle}
        onThemeChange={changeTheme}
        onProviderChange={changeProvider}
        onClose={() => setSettingsOpen(false)}
        onOpenDiagram={() => {
          setSettingsOpen(false);
          setDiagramOpen(true);
        }}
      />

      <div className={styles.body}>
        <div className={styles.mainColumn}>
          <StatTiles rows={displayRows} />

          {/* Rendered here, not inside .tableRegion below — the shade needs
              to cover StatTiles too, all the way up to the masthead, not
              just the table. The card/overlay itself stays positioned
              relative to .tableRegion (still centered on the table
              specifically); only the shade's own coverage area is bigger. */}
          {shadeAnim.mounted && <Shade z={shadeZ} closing={shadeAnim.closing} onClick={onShadeClick} />}

          <div className={styles.tableRegion}>
            <div className={styles.tableScroll}>
              <ClaimsTable
                rows={displayRows}
                onOpenClaim={openCard}
                selected={selectedClaimIds}
                onSelectedChange={setSelectedClaimIds}
                bulkBarState={bulkBarState}
                onBulkAction={runBulkAction}
              />
            </div>

            {cardAnim.mounted && activeRow && (
              // Keyed by claim id — cardAnim.mounted now stays continuously
              // true across a same-layer row swap (see useExitAnimation), so
              // this key is what forces a genuinely fresh ClaimsCard instance
              // (fresh view/height state, replayed entrance animation) right
              // as the linked claim swaps in, rather than a live prop update
              // on the still-mounted old instance.
              <ModalLayer key={activeRow.claim.claim_id} z={30} wide closing={cardAnim.closing}>
                <ClaimsCard
                  row={activeRow}
                  onClose={closeAll}
                  onRequestAction={(action) => setModal({ layer: 'overlay', claimId: activeRow.claim.claim_id, action })}
                  onOpenLinkedClaim={openLinkedClaim}
                />
              </ModalLayer>
            )}

            {overlayAnim.mounted && activeAction && activeRow && (
              // Keyed by claim + action together, not action alone — a
              // sequential bulk queue (lib/ui/bulk-actions.ts) advances
              // between claims that often share the *same* action (every
              // Request Additional Info step, or two Denied claims in a
              // row), so keying by action alone left React reusing the same
              // ActionConfirmOverlay instance across steps. That instance's
              // own `staged` state is deliberately sticky (fixes a separate
              // stale-flash bug, see its own comment) — reused instead of
              // remounted, it carried the finished claim's confirmation
              // screen into the next one, blocking it entirely. Found live
              // 2026-08-06.
              <ModalLayer key={`${activeRow.claim.claim_id}-${activeAction}`} z={50} closing={overlayAnim.closing}>
                <ActionConfirmOverlay
                  row={activeRow}
                  action={activeAction}
                  onStage={(result) => stagePending(activeRow.claim.claim_id, result)}
                  onDismissConfirm={commitPending}
                  onCancelPending={cancelPending}
                  onCancel={cancelOverlay}
                />
              </ModalLayer>
            )}
          </div>
        </div>

        <AnchorPanel
          providerNames={providerNames}
          rows={displayRows}
          claimInView={cardVisible ? activeRow?.displayNumber : undefined}
          selectedClaimIds={selectedRows.map((r) => r.displayNumber)}
          onOpenCard={openCard}
          provider={provider}
        />
      </div>

      {/* The diagram overlay is independent of the card/overlay state
          machine above — it can open from Settings at any time, regardless
          of what else is on screen, so it gets its own shade at the highest
          z-index rather than slotting into that layering model. */}
      {diagramShadeAnim.mounted && (
        <div className={styles.fullPageShadeWrap}>
          <Shade z={100} closing={diagramShadeAnim.closing} onClick={() => setDiagramOpen(false)} />
        </div>
      )}
      {diagramAnim.mounted && <WorkflowDiagramModal onClose={() => setDiagramOpen(false)} closing={diagramAnim.closing} />}
    </div>
  );
}
