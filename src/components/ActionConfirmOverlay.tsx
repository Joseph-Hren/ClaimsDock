'use client';

import { useState } from 'react';
import styles from './ActionConfirmOverlay.module.css';
import { Button } from './Button';
import { checkRecommendationMismatch } from '../lib/humangate/mismatch';
import { submitHumanAction, submitPostTerminalAction, addAuditNote } from '../lib/humangate/actions';
import { getAuditLogForClaim, appendAuditEntry } from '../lib/persistence/local-store';
import type { DashboardClaimRow } from '../lib/ui/dashboard-rows';
import type { HumanActionType, PostTerminalAction, DenialJustification, AuditLogEntry } from '../lib/humangate/types';
import type { DenialJustificationCheckResult } from '../lib/humangate/guardrails';
import type { ClaimStatus } from '../lib/rules/status';
import type { SeverityBand } from '../lib/rules/severity';

// approve_with_edit has no overlay of its own here — it's reserved for a
// coverage-override flow no button in this build ever dispatches yet.
// 'note' is a free-form audit-log entry (Figma node 310:6221/310:6261) —
// no status change, no mismatch/quality guardrail, and correspondingly no
// grace-window confirm screen in the design, unlike every other action.
type OverlayAction = Exclude<HumanActionType, 'approve_with_edit'> | PostTerminalAction | 'note';
interface SubmitResultLike {
  status: ClaimStatus;
  severity: SeverityBand;
  auditEntry: AuditLogEntry;
}
const POST_TERMINAL_ACTIONS: PostTerminalAction[] = ['undo_request_additional_info', 'undo_escalate', 'undo_deny', 'request_recoupment', 'undo_recoupment'];
function isPostTerminal(action: OverlayAction): action is PostTerminalAction {
  return (POST_TERMINAL_ACTIONS as string[]).includes(action);
}

// Copy matched directly against Figma node 273:5202 — see build-log for the
// session that surveyed every variant. Deliberately not normalized across
// actions (e.g. "Request additional info" vs "Deny claim" in warning
// titles) — this mirrors the design's own inconsistency rather than
// guessing at a "fix."
interface HumanActionMeta {
  inputTitle: string;
  noteLabel: string;
  noteRequired: boolean;
  submitLabel: string;
  warningTitle: string;
  warningSubmitLabel: string;
  confirmedText: string;
  confirmedCancelLabel: string;
}

const HUMAN_ACTION_META: Record<'approve' | 'escalate' | 'request_additional_info', HumanActionMeta> = {
  approve: {
    inputTitle: 'Approve claim',
    noteLabel: 'Provide an optional message for approval:',
    noteRequired: false,
    submitLabel: 'Submit claim approval',
    warningTitle: 'Approve claim',
    warningSubmitLabel: 'Approve anyway',
    confirmedText: 'This claim has been approved.',
    confirmedCancelLabel: 'Cancel approval',
  },
  escalate: {
    inputTitle: 'Escalate claim status',
    noteLabel: 'Provide an optional message for escalation:',
    noteRequired: false,
    submitLabel: 'Submit escalation',
    warningTitle: 'Escalate claim',
    warningSubmitLabel: 'Escalate anyway',
    confirmedText: 'This claim has been escalated.',
    confirmedCancelLabel: 'Cancel escalation',
  },
  request_additional_info: {
    inputTitle: 'Request additional information',
    noteLabel: 'Provide instructions for including the missing data needed for adjudication:',
    noteRequired: true,
    submitLabel: 'Submit request for additional info',
    warningTitle: 'Request additional info',
    warningSubmitLabel: 'Request additional info anyway',
    confirmedText: 'Additional information has been requested for this claim.',
    confirmedCancelLabel: 'Cancel request',
  },
};

const DENY_WARNING_TITLE = 'Deny claim';
const DENY_WARNING_SUBMIT_LABEL = 'Deny claim anyway';
const DENY_CONFIRMED_TEXT = 'This claim has been denied.';
const DENY_CONFIRMED_CANCEL_LABEL = 'Reverse denial';

const DENY_FIELD_KEYS = ['specificReason', 'planPolicyProvision', 'internalRuleOrStandard', 'reversalCriteria'] as const;
type DenyFieldKey = (typeof DENY_FIELD_KEYS)[number];

const DENY_FIELD_LABEL: Record<DenyFieldKey, string> = {
  specificReason: '1. Specific reason(s) for denial:',
  planPolicyProvision: '2. Plan/policy provision(s) cited:',
  internalRuleOrStandard: '3. Internal rule, clinical protocol, or medical-necessity standard applied (if any)',
  reversalCriteria: '4. Provide any information on what may reverse the decision (if none, state explicitly)',
};

// Fixed per-field label shown on a real (non-blank) rejection — distinct
// from the blank-field message, and never the model's own free-text
// `feedback`, which stays internal (Figma shows one short fixed line per
// field, not the model's fuller diagnostic).
const DENY_REJECT_LABEL: Record<DenyFieldKey, string> = {
  specificReason: 'Reason(s) for denial are not properly structured for legal claim denial adjudication.',
  planPolicyProvision: 'The plan/policy provisions for claim denial are not properly structured for legal claim denial adjudication.',
  internalRuleOrStandard: 'Internal rules, protocols, or medical necessity reasons are not properly structured for legal claim denial adjudication.',
  reversalCriteria: 'Information for reversing the denial decision is not properly structured for legal claim denial adjudication.',
};

const BLANK_MESSAGE = 'This field cannot be left blank.';

interface PostTerminalMeta {
  title: string;
  hint: string;
  noteLabel: string;
  noteRequired: boolean;
  showCancelOnConfirm: boolean;
  confirmedCancelLabel?: string;
}

const UNDO_META: PostTerminalMeta = {
  title: 'Reverse last action.',
  hint: 'Confirming will return the claim to its previous state. You may then apply a different action or reapply the same action.',
  noteLabel: 'Provide a message for action reversal:',
  noteRequired: true,
  showCancelOnConfirm: false,
};

const RECOUPMENT_CONFIRMED_TEXT = 'The process of recoupment for this claim has begun.';
// Fixed text, not the generic "reverted to X" phrasing every other undo
// action gets — matches Figma node 312:6610 exactly.
const UNDO_RECOUPMENT_CONFIRMED_TEXT = 'Recoupment for this claim has been cancelled.';

const POST_TERMINAL_META: Record<PostTerminalAction, PostTerminalMeta> = {
  undo_request_additional_info: UNDO_META,
  undo_escalate: UNDO_META,
  undo_deny: UNDO_META,
  request_recoupment: {
    title: 'Request recoupment',
    hint: 'Confirming will begin a recoupment process for this claim.',
    noteLabel: 'Provide a message for recoupment reason:',
    noteRequired: true,
    showCancelOnConfirm: true,
    confirmedCancelLabel: 'Cancel recoupment',
  },
  // The one post-terminal action with an optional note (project-spec.txt
  // Section 4b, amended 2026-08-06) and no cancel-on-confirm — matches
  // Figma node 312:6611/312:6610 exactly.
  undo_recoupment: {
    title: 'Cancel recoupment',
    hint: 'Confirming will cancel the recoupment process for this claim.',
    noteLabel: 'Provide an optional message for recoupment cancellation:',
    noteRequired: false,
    showCancelOnConfirm: false,
  },
};

type Phase = 'warning' | 'input' | 'checking';

export default function ActionConfirmOverlay({
  row,
  action,
  onStage,
  onDismissConfirm,
  onCancelPending,
  onCancel,
}: {
  row: DashboardClaimRow;
  action: OverlayAction;
  onStage: (result: SubmitResultLike) => void;
  onDismissConfirm: () => void;
  onCancelPending: () => void;
  onCancel: () => void;
}) {
  const postTerminal = isPostTerminal(action);

  const [phase, setPhase] = useState<Phase>(() => {
    if (action === 'note' || postTerminal) return 'input';
    const mismatch = checkRecommendationMismatch(row.result, action);
    return mismatch.mismatched ? 'warning' : 'input';
  });
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const [fields, setFields] = useState<DenialJustification>({
    specificReason: '',
    planPolicyProvision: '',
    internalRuleOrStandard: '',
    reversalCriteria: '',
  });
  const [fieldResults, setFieldResults] = useState<DenialJustificationCheckResult | null>(null);
  const [hasUsedAutoFill, setHasUsedAutoFill] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local, sticky — set once the human confirms and never cleared just
  // because Dashboard's own pending/timer state has moved on (that state
  // clears the instant the grace window commits, while this overlay is
  // still fading out for another ~320ms; reading Dashboard's state directly
  // used to make the confirmed screen flash back to the stale input form
  // for that window — found live, 2026-08-05). Cleared implicitly on
  // unmount (a fresh action always mounts a fresh overlay instance, keyed
  // by action in Dashboard).
  const [staged, setStaged] = useState<SubmitResultLike | null>(null);

  function stage(result: SubmitResultLike) {
    setStaged(result);
    onStage(result);
  }

  // Placed ahead of the staged/confirmed check below (rather than grouped
  // with postTerminal/deny further down) specifically so TypeScript narrows
  // `action` to exclude 'note' for everything after this block — 'note'
  // never calls stage(), so `staged` is always null here, but the confirmed
  // view's own per-action-kind branching below indexes HUMAN_ACTION_META by
  // `action` and needs 'note' excluded from its type to do that safely.
  if (action === 'note') {
    const blank = noteTouched && !note.trim();
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <span className={styles.claimId}>{row.displayNumber}</span>
          <button className={styles.close} onClick={onCancel} aria-label="Close">
            Close ×
          </button>
        </div>
        <h3 className={styles.title}>Add a note</h3>
        <label className={blank ? styles.noteLabelError : styles.noteLabel}>Provide a message for the audit log:</label>
        <textarea
          className={blank ? styles.noteError : styles.note}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {blank && <p className={styles.fieldError}>{BLANK_MESSAGE}</p>}
        <div className={styles.actions}>
          <Button
            kind="primary"
            onClick={() => {
              if (!note.trim()) {
                setNoteTouched(true);
                return;
              }
              // No status change, no guardrail, and — matching the Figma
              // design — no grace-window confirm screen: this appends
              // directly rather than going through stage()/onStage, and
              // just closes back to the card on success.
              appendAuditEntry(addAuditNote(row.claim.claim_id, row.status, note.trim()));
              onCancel();
            }}
          >
            Submit note
          </Button>
          <Button kind="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (staged) {
    let confirmedText: string;
    let cancelLabel: string | undefined;
    let showCancel: boolean;
    if (action === 'deny') {
      confirmedText = DENY_CONFIRMED_TEXT;
      cancelLabel = DENY_CONFIRMED_CANCEL_LABEL;
      showCancel = true;
    } else if (action === 'request_recoupment') {
      confirmedText = RECOUPMENT_CONFIRMED_TEXT;
      cancelLabel = POST_TERMINAL_META.request_recoupment.confirmedCancelLabel;
      showCancel = true;
    } else if (action === 'undo_recoupment') {
      confirmedText = UNDO_RECOUPMENT_CONFIRMED_TEXT;
      showCancel = false;
    } else if (postTerminal) {
      confirmedText = `The status of this claim has been reverted to ${staged.status.toLowerCase()}.`;
      showCancel = false;
    } else {
      const meta = HUMAN_ACTION_META[action];
      confirmedText = meta.confirmedText;
      cancelLabel = meta.confirmedCancelLabel;
      showCancel = true;
    }

    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <span className={styles.claimId}>{row.displayNumber}</span>
        </div>
        <p className={styles.confirmedText}>{confirmedText}</p>
        <div className={styles.actions}>
          {showCancel && (
            <Button kind="primary-warning" onClick={onCancelPending}>
              {cancelLabel}
            </Button>
          )}
          <Button kind="secondary" onClick={onDismissConfirm}>
            Dismiss
          </Button>
        </div>
      </div>
    );
  }

  if (postTerminal) {
    const meta = POST_TERMINAL_META[action];
    const blank = meta.noteRequired && noteTouched && !note.trim();
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <span className={styles.claimId}>{row.displayNumber}</span>
          <button className={styles.close} onClick={onCancel} aria-label="Close">
            Close ×
          </button>
        </div>
        <h3 className={styles.title}>{meta.title}</h3>
        <p className={styles.hint}>{meta.hint}</p>
        <label className={blank ? styles.noteLabelError : styles.noteLabel}>{meta.noteLabel}</label>
        <textarea
          className={blank ? styles.noteError : styles.note}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {blank && <p className={styles.fieldError}>{BLANK_MESSAGE}</p>}
        <div className={styles.actions}>
          <Button
            kind="primary"
            onClick={() => {
              if (meta.noteRequired && !note.trim()) {
                setNoteTouched(true);
                return;
              }
              const auditLog = getAuditLogForClaim(row.claim.claim_id);
              const result = submitPostTerminalAction(row.claim, row.result, auditLog, {
                claimId: row.claim.claim_id,
                action,
                note: note.trim() || undefined,
              });
              stage(result);
            }}
          >
            Confirm
          </Button>
          <Button kind="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (action === 'deny') {
    if (phase === 'warning') {
      return (
        <WarningCard
          row={row}
          title={DENY_WARNING_TITLE}
          submitLabel={DENY_WARNING_SUBMIT_LABEL}
          onProceed={() => setPhase('input')}
          onCancel={onCancel}
        />
      );
    }

    const checking = phase === 'checking';
    // Real content was rejected (not just blank) — the only case that earns
    // "anyway" phrasing and the Auto-fill button. An all-blank check has
    // fieldResults set too, but no field ever gets a suggestedReplacement
    // for pure blankness, so this stays false there.
    const hasSuggestions = fieldResults !== null && DENY_FIELD_KEYS.some((k) => fieldResults[k].suggestedReplacement);
    const anyBlank = DENY_FIELD_KEYS.some((k) => !fields[k].trim());
    // Disabled once a check has actually run and a field is still blank —
    // never disabled before the first attempt, so a fresh, all-blank form
    // can still be submitted once to surface the per-field blank warnings.
    const blockedByBlank = fieldResults !== null && anyBlank;

    async function submitDenyForm() {
      // Bypass Dcl entirely once Auto-fill has been used at all, edited afterward or not — added 2026-08-06 after
      // repeated live cases of Dcl rejecting its own just-given suggestion on a fresh, independent re-evaluation.
      // Originally built as an exact-match check (only bypass if nothing was touched since Auto-fill), which was
      // narrower than actually intended: the real point isn't "the text is unchanged," it's that Auto-fill is the
      // moment the adjuster takes over — from there, submitting as-is, tweaking it, or blanking it out and typing
      // something else entirely are all just the human's own call, not something Dcl needs to bless a second time
      // (the guardrail's own "never blocks" principle already covers exactly this). Confirmed live: a re-check on
      // the unedited suggestion could still contradict its own prior verdict, and a re-check after any edit adds
      // another multi-minute round trip for a decision that's already the adjuster's to make either way.
      if (hasUsedAutoFill) {
        finalizeDeny();
        return;
      }

      setError(null);
      setPhase('checking');
      try {
        const res = await fetch('/api/humangate/deny-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipelineResult: row.result, denialJustification: fields }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to check the denial justification.');
        const result = data as DenialJustificationCheckResult;
        setFieldResults(result);
        if (DENY_FIELD_KEYS.every((k) => result[k].acceptable)) {
          finalizeDeny();
        } else {
          setPhase('input');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check the denial justification.');
        setPhase('input');
      }
    }

    function finalizeDeny() {
      const result = submitHumanAction(row.claim, row.result, { claimId: row.claim.claim_id, action: 'deny', denialJustification: fields });
      stage(result);
    }

    function autoFillSuggestions() {
      if (!fieldResults) return;
      const next = { ...fields };
      for (const key of DENY_FIELD_KEYS) {
        const suggestion = fieldResults[key].suggestedReplacement;
        if (suggestion) next[key] = suggestion;
      }
      setFields(next);
      // Marks the point past which submitDenyForm() bypasses Dcl entirely, edited afterward or not — see that
      // function's own comment for why this is a one-way door rather than an exact-text match.
      setHasUsedAutoFill(true);
      // Clearing fieldResults is what reverts the button back to a plain "Submit claim denial" label (per
      // hasSuggestions/blockedByBlank above) — the bypass above means this submit finalizes directly regardless.
      setFieldResults(null);
    }

    return (
      <div className={styles.denyCard}>
        <div className={styles.headerRow}>
          <span className={styles.claimId}>{row.displayNumber}</span>
          <button className={styles.close} onClick={onCancel} aria-label="Close">
            Close ×
          </button>
        </div>
        <h3 className={styles.title}>Deny claim</h3>

        {DENY_FIELD_KEYS.map((key) => {
          const isBlank = fieldResults !== null && !fields[key].trim();
          const rejected = fieldResults !== null && !fieldResults[key].acceptable && !isBlank;
          return (
            <div key={key} className={styles.denyField}>
              <label className={styles.noteLabel}>{DENY_FIELD_LABEL[key]}</label>
              <textarea
                className={isBlank || rejected ? styles.noteError : styles.note}
                rows={2}
                value={fields[key]}
                onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
              />
              {isBlank && <p className={styles.fieldError}>{BLANK_MESSAGE}</p>}
              {/* The model's own free-text `feedback` was shown here briefly (2026-08-06) to debug the guardrail
                  itself against real live rejections — that was a build-time diagnostic, not something an adjuster
                  needs or should see day to day. Reverted to the fixed label; the "Suggested message" section below
                  is the actionable part for the adjuster, not the model's own internal reasoning about why. */}
              {rejected && <p className={styles.fieldError}>{DENY_REJECT_LABEL[key]}</p>}
            </div>
          );
        })}

        {hasSuggestions && (
          <>
            <div className={styles.divider} />
            <p className={styles.hint}>Suggested message:</p>
            <ol className={styles.suggestList}>
              {DENY_FIELD_KEYS.map((key, i) => {
                const suggestion = fieldResults?.[key].suggestedReplacement;
                if (!suggestion) return null;
                // Explicit value, not sequential auto-numbering — a field
                // with no suggestion (e.g. field 1 passing) is skipped
                // entirely, and a plain <ol> then renumbers whatever's left
                // starting from 1 regardless of which field it actually
                // belongs to. Found live 2026-08-06: fields 2-4 needing
                // corrections rendered as "1, 2, 3" instead of "2, 3, 4."
                return (
                  <li key={key} value={i + 1}>
                    {suggestion}
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {/* `error` only ever means the automated check itself broke (a
            network/model failure) — a real per-field rejection is reported
            through fieldResults/feedback above instead, with no `error` set.
            The guardrail's own stated principle (guardrails.ts's header
            comment) is "never blocks a human from proceeding with their
            original text" — found live 2026-08-06 not actually holding for
            this failure mode: a repeated crash left the adjuster re-running
            the same fragile check with no way to just submit. This gives
            that explicit way out, distinct from a normal rejection. */}
        {error && (
          <p className={styles.fieldError}>
            Automated review is unavailable right now ({error}). You can retry, or submit as written without it.
          </p>
        )}

        <div className={styles.actions}>
          <Button
            kind="primary-warning"
            className={styles.denySubmitButton}
            onClick={hasSuggestions ? finalizeDeny : submitDenyForm}
            disabled={checking || blockedByBlank}
          >
            {checking ? (
              <>
                <span className={styles.loadingDots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className={styles.srOnly}>Checking denial justification…</span>
              </>
            ) : hasSuggestions ? (
              'Submit denial anyway'
            ) : error ? (
              'Retry automated review'
            ) : (
              'Submit denial'
            )}
          </Button>
          {hasSuggestions && (
            <Button kind="secondary" onClick={autoFillSuggestions}>
              Auto-fill suggestions
            </Button>
          )}
          {error && (
            <Button kind="secondary" onClick={finalizeDeny} disabled={anyBlank}>
              Submit without automated review
            </Button>
          )}
          <Button kind="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // approve / escalate / request_additional_info
  const meta = HUMAN_ACTION_META[action];
  if (phase === 'warning') {
    return <WarningCard row={row} title={meta.warningTitle} submitLabel={meta.warningSubmitLabel} onProceed={() => setPhase('input')} onCancel={onCancel} />;
  }

  const blank = meta.noteRequired && noteTouched && !note.trim();
  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <span className={styles.claimId}>{row.displayNumber}</span>
        <button className={styles.close} onClick={onCancel} aria-label="Close">
          Close ×
        </button>
      </div>
      <h3 className={styles.title}>{meta.inputTitle}</h3>
      <label className={blank ? styles.noteLabelError : styles.noteLabel}>{meta.noteLabel}</label>
      <textarea className={blank ? styles.noteError : styles.note} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      {blank && <p className={styles.fieldError}>{BLANK_MESSAGE}</p>}
      <div className={styles.actions}>
        <Button
          kind="primary"
          onClick={() => {
            if (meta.noteRequired && !note.trim()) {
              setNoteTouched(true);
              return;
            }
            const result = submitHumanAction(row.claim, row.result, { claimId: row.claim.claim_id, action, note: note.trim() || undefined });
            stage(result);
          }}
        >
          {meta.submitLabel}
        </Button>
        <Button kind="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function WarningCard({
  row,
  title,
  submitLabel,
  onProceed,
  onCancel,
}: {
  row: DashboardClaimRow;
  title: string;
  submitLabel: string;
  onProceed: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.warningCard}>
      <div className={styles.headerRow}>
        <span className={styles.claimId}>{row.displayNumber}</span>
        <button className={styles.close} onClick={onCancel} aria-label="Close">
          Close ×
        </button>
      </div>
      <h3 className={styles.warningTitle}>⚠ {title}</h3>
      <p className={styles.hint}>The recommended action for this claim is to {row.result.recommended_action.toLowerCase()}.</p>
      <div className={styles.actions}>
        <Button kind="primary-warning" onClick={onProceed}>
          {submitLabel}
        </Button>
        <Button kind="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
