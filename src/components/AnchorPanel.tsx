'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './AnchorPanel.module.css';
import { pickSuggestedPrompts } from '../lib/router/suggested-prompts';
import ChatButton from './ChatButton';
import MiniCard from './MiniCard';
import { AnchorLogo } from './ChromeIcons';
import type { DashboardClaimRow } from '../lib/ui/dashboard-rows';
import type { ModelProvider } from '../lib/pipeline/model-client';

interface AnchorToolCall {
  name: string;
  input: unknown;
  result: unknown;
}

interface AnchorExchange {
  id: number;
  question: string;
  answer: string;
  toolCalls: AnchorToolCall[];
}

// Collects every claim ID cited across all tool calls in an answer, in
// first-seen order, deduped — covers all three result shapes: a single
// lookup/analyze result ({ data: { claim_id } }), a filtered lookup's match
// list ({ data: { matches: [{ claim_id }] } }), and recommend_action's batch
// result ({ data: { results: [{ claim_id }] } }). reference_lookup matches
// none of these and correctly yields no citation.
const MINI_CARD_CAP = 10;

function extractCitedClaimIds(toolCalls: AnchorToolCall[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === 'string' && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  for (const call of toolCalls) {
    const data = (call.result as { data?: Record<string, unknown> } | undefined)?.data;
    if (!data) continue;
    add(data.claim_id);
    for (const list of [data.matches, data.results]) {
      if (Array.isArray(list)) for (const entry of list) add((entry as { claim_id?: unknown })?.claim_id);
    }
  }
  return ids;
}

export default function AnchorPanel({
  providerNames,
  rows,
  claimInView,
  selectedClaimIds,
  onOpenCard,
  onSelectClaims,
  provider,
}: {
  providerNames: string[];
  rows: DashboardClaimRow[];
  /** The display number of whatever claim the adjuster currently has open,
   *  if any — passed straight through to Anchor's own "claim in view" logic. */
  claimInView?: string;
  /** Display numbers of claims currently checkbox-selected in the claims
   *  table — added 2026-08-06 so Anchor can answer "tell me about these"
   *  after a multi-select, distinct from a single claim in view. */
  selectedClaimIds?: string[];
  onOpenCard?: (row: DashboardClaimRow) => void;
  /** Called with the real (internal) claim_ids that should now be selected,
   *  after resolving every select_claims/deselect_claims call in an
   *  exchange in order (2026-08-11) — always the final, fully-resolved
   *  selection, a single replace, never a separate add/remove callback (see
   *  this prop's call site in ask() for why that split was the actual bug). */
  onSelectClaims?: (claimIds: string[]) => void;
  /** Which model answers Anchor's questions — set via the Settings panel's
   *  toggle (Phase 13 Pass B), lifted to Dashboard.tsx and persisted there. */
  provider: ModelProvider;
}) {
  const [input, setInput] = useState('');
  // The draw is genuinely random (Math.random()), so it can only happen
  // client-side — computing it during the shared server/client render would
  // make the server's HTML and the client's first render disagree and force
  // a hydration error. Starting empty and filling in after mount keeps the
  // two in sync; the timer (rather than a bare effect-body setState) keeps
  // this async, matching the project's rule against synchronous setState
  // inside an effect body.
  const [pills, setPills] = useState<string[]>([]);
  // Drawn once, on mount only (deliberately not depending on providerNames)
  // — providerNames is a new array reference (Dashboard.tsx derives it
  // fresh from rows every render) on every one of DashboardLoader's
  // progressive-loading polls (2026-08-10), so depending on it here
  // reshuffled the pills on every chunk that finished loading, a
  // distracting flicker unrelated to anything the adjuster did. mount-time
  // providerNames is what's captured below, via the closure — AnchorPanel
  // itself doesn't mount until Dashboard does (DashboardLoader withholds it
  // until the first chunk of rows exists), so there's always at least one
  // real provider name available by then.
  useEffect(() => {
    const timer = setTimeout(() => setPills(pickSuggestedPrompts(4, { scope: 'general', providerNames })), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  // Newest first (index 0) — every exchange accumulates rather than
  // replacing the last one, per the scrolling-history decision (Phase 13
  // Pass A). nextId is a plain ref counter, not crypto.randomUUID(): ids are
  // only ever minted inside ask() (a client event handler), never during
  // render, so there's no hydration-mismatch concern either way — a counter
  // just keeps them simple and deterministic for tests.
  const [history, setHistory] = useState<AnchorExchange[]>([]);
  const nextId = useRef(0);
  const [errorMessage, setErrorMessage] = useState('');
  const historyListRef = useRef<HTMLDivElement>(null);
  const prevTopIdRef = useRef<number | null>(null);

  // Smoothly scrolls the history list back to the top when a genuinely new
  // answer arrives — not while thinking, only on actual arrival — so a new
  // message doesn't get missed if the user scrolled down to reread an older
  // one while waiting. Runs from an effect (after React has committed the
  // new exchange), not right after setHistory, since prepending content to
  // an already-scrolled container can shift scrollTop unpredictably — the
  // effect guarantees a stable, post-render starting measurement. Manual
  // rAF animation, not scrollTo({behavior:'smooth'}): native smooth-scroll
  // duration isn't controllable and varies by distance/browser, where this
  // needs a short, fixed, consistent one.
  useEffect(() => {
    const topId = history[0]?.id;
    if (topId === undefined || topId === prevTopIdRef.current) return;
    prevTopIdRef.current = topId;

    const maybeEl = historyListRef.current;
    if (!maybeEl || maybeEl.scrollTop === 0) return;
    const el: HTMLDivElement = maybeEl;

    // Duration read live from --dur-scroll-to-new so prefers-reduced-motion's
    // override (tokens.css) is honored automatically, same as every other
    // animation in this app.
    const durVar = getComputedStyle(document.documentElement).getPropertyValue('--dur-scroll-to-new').trim();
    const duration = parseFloat(durVar) * 1000 || 160;
    const start = el.scrollTop;
    const startTime = performance.now();

    let frame: number;
    function step(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      // Ease-out cubic — a close approximation of --ease-standard's
      // cubic-bezier(0.4, 0, 0.2, 1), not a real bezier solve; visually
      // indistinguishable at a duration this short.
      const eased = 1 - Math.pow(1 - progress, 3);
      el.scrollTop = start * (1 - eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [history]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || status === 'loading') return;
    setStatus('loading');
    setErrorMessage('');
    // Exactly one prior turn, distilled to plain text — see AnchorContext's
    // own comment (anchor.ts) for why not more, and not the raw tool history.
    const mostRecent = history[0];
    const priorTurn = mostRecent ? { question: mostRecent.question, answer: mostRecent.answer } : undefined;
    try {
      const res = await fetch('/api/anchor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, claimInView, selectedClaimIds, rows, priorTurn, provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Anchor could not answer that.');
      const toolCalls: AnchorToolCall[] = data.toolCalls ?? [];
      const exchange: AnchorExchange = {
        id: nextId.current++,
        question: trimmed,
        answer: data.answer,
        toolCalls,
      };
      setHistory((prev) => [exchange, ...prev]);
      // select_claims's result is the exact same shape lookup_claim's own
      // filtered results already are — extractCitedClaimIds already knows
      // how to read matches[].claim_id out of it, so reused here rather than
      // a second extraction path. The IDs in a call's own result are display
      // numbers (never the real internal claim_id — project-spec.txt Section
      // 7d); rows maps them back.
      //
      // Folded through every select_claims/deselect_claims call in this
      // exchange, IN ORDER, into one final selection — not two independent
      // callbacks/setState calls, one per call. That was the original
      // design and it had a real bug, found live 2026-08-11: a combined
      // "clear this selection and select claims that need approval" request
      // correctly called both tools, but applying them as two separate
      // setSelectedClaimIds updates meant deselect's own "clear everything"
      // branch (a plain `() => new Set()`, ignoring prior state) always won
      // outright regardless of which tool the model actually called first,
      // silently discarding the select every time the two combined.
      const selectionCalls = toolCalls.filter((c) => c.name === 'select_claims' || c.name === 'deselect_claims');
      if (selectionCalls.length > 0 && onSelectClaims) {
        let working = new Set(rows.filter((r) => selectedClaimIds?.includes(r.displayNumber)).map((r) => r.claim.claim_id));
        for (const call of selectionCalls) {
          const displayNumbers = extractCitedClaimIds([call]);
          const realIds = rows.filter((r) => displayNumbers.includes(r.displayNumber)).map((r) => r.claim.claim_id);
          if (call.name === 'select_claims') {
            working = new Set(realIds);
          } else {
            const mode = (call.result as { mode?: string } | undefined)?.mode;
            working = mode === 'cleared' ? new Set() : new Set([...working].filter((id) => !realIds.includes(id)));
          }
        }
        onSelectClaims([...working]);
      }
      setStatus('idle');
      setInput('');
      // Fresh suggestions after each real question — an explicit redraw
      // here, not a side effect of some other re-render, now that the pill
      // effect above only fires once on mount (2026-08-10). Previously this
      // "worked" only by accident: providerNames was a new array reference
      // on every Dashboard render, so any re-render (including the one this
      // very answer caused) happened to retrigger the old
      // providerNames-dependent effect too — which was also exactly why it
      // wrongly refired on every progressive-loading chunk.
      setPills(pickSuggestedPrompts(4, { scope: 'general', providerNames }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Anchor could not answer that.');
      setStatus('error');
    }
  }

  const isLoading = status === 'loading';

  return (
    <aside className={styles.panel}>
      <h2 className={styles.title}>
        <AnchorLogo height={22} shimmer={isLoading} />
        <span className={styles.srOnly}>Anchor</span>
      </h2>
      <p className={styles.disclaimer}>
        Anchor&rsquo;s responses are grounded in plan documents. ClaimsDock recommends verifying before final adjudication.
      </p>

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          placeholder="Ask Anchor about a claim or policy…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask(input);
          }}
          disabled={isLoading}
        />
        <ChatButton aria-label="Ask Anchor" onClick={() => ask(input)} disabled={isLoading || !input.trim()} />
      </div>

      <div className={styles.pillRow}>
        {pills.map((pill) => (
          <button key={pill} className={styles.pill} onClick={() => setInput(pill)} disabled={isLoading}>
            {pill}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className={styles.thinking}>
          <span className={styles.srOnly} role="status">
            Anchor is thinking
          </span>
          <div className={styles.shimmerBar} style={{ width: '100%' }} />
          <div className={styles.shimmerBar} style={{ width: '83%' }} />
          <div className={styles.shimmerBar} style={{ width: '34%', marginLeft: '33%' }} />
          <div className={styles.shimmerBar} style={{ width: '83%', marginLeft: '17%' }} />
          <div className={styles.shimmerBar} style={{ width: '100%' }} />
        </div>
      )}
      {status === 'error' && <p className={styles.errorNote}>{errorMessage}</p>}

      {history.length > 0 && (
        <div className={styles.historyList} ref={historyListRef}>
          {history.map((exchange) => {
            const citedClaimIds = extractCitedClaimIds(exchange.toolCalls);
            const citedRows = citedClaimIds
              .map((id) => rows.find((r) => r.displayNumber === id))
              .filter((r): r is DashboardClaimRow => r !== undefined);
            const shownRows = citedRows.slice(0, MINI_CARD_CAP);
            const extraCount = citedRows.length - shownRows.length;

            return (
              <div key={exchange.id} className={styles.exchange}>
                <div className={styles.answerBlock}>
                  <p className={styles.answerQuestion}>{exchange.question}</p>
                  <div className={styles.answerText}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{exchange.answer}</ReactMarkdown>
                  </div>
                </div>

                {shownRows.length > 0 && (
                  <>
                    <p className={styles.sampleLabel}>
                      {shownRows.length === 1 ? 'Claim referenced in this answer:' : 'Claims referenced in this answer:'}
                    </p>
                    <div className={styles.miniCardList}>
                      {shownRows.map((row) => (
                        <MiniCard key={row.displayNumber} row={row} onOpenCard={() => onOpenCard?.(row)} />
                      ))}
                    </div>
                    {extraCount > 0 && <p className={styles.moreNote}>+ {extraCount} more</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
