import { AnchorLogo } from '../components/ChromeIcons';
import { shuffledOrder } from './fact-cycler';
import styles from './loading.module.css';

// Next.js's automatic Suspense boundary for the async Home page below
// (page.tsx now awaits buildDashboardRows()). Only actually seen on an
// uncached ISO week — real live model calls, realistically 20-60+ seconds;
// every load after that hits Phase 7's per-ISO-week cache and never reaches
// this at all.
//
// Deliberately a plain Server Component with no client JS at all (rewritten
// 2026-08-07) — a prior version cycled facts via a useEffect, which tested
// correctly everywhere it could actually be tested (fresh mount, StrictMode,
// a real hydrateRoot pass, even a simulated remount), but a live report of
// it staying frozen on the first fact in production pointed at something
// none of those tests could reach: this fallback is delivered as the first
// flushed chunk of a single HTTP response that then stays open for up to
// ~90s while the real page streams in behind it, and there was no way to
// confirm from here whether client JS reliably hydrates and starts running
// during that unusually long-pending stream. Rather than keep patching a
// mechanism riding on an unverifiable assumption, this removes the
// assumption: every fact renders into the HTML up front, and a shared CSS
// keyframe animation (with a per-item delay, computed below) handles the
// cycling entirely on the browser's own compositor — the same reason the
// shimmer bars already kept animating even when the fact text didn't.

const FACTS: string[] = [
  "ClaimsDock's interface has three distinct visual styles: Ledger, Clinical, and Field — switchable in the Settings panel.",
  'ClaimsDock has a light mode and a dark mode, both available in the Settings panel.',
  "You can choose between Anthropic's Claude or Moonshot's Kimi for the underlying AI model in Anchor, ClaimsDock's copilot.",
  'The full system architecture — pipeline, router, human gate — is viewable as an interactive diagram inside the app.',
  'A denial carries real legal weight — ERISA requires specific, cited reasoning before a claim can be turned down. ClaimsDock builds that reasoning into the process.',
  'Every claim runs through two separate, isolated AI calls: one to find the evidence, a second — blind to the first — to judge how confident that evidence actually is.',
  "Anchor can answer a general question about claims policy, or dig into the specifics of whatever claim you're looking at or have selected.",
  "ClaimsDock's reasoning is grounded in real, cited source material: federal regulation (ERISA), a Treasury advisory (FinCEN), and industry fraud-detection standards (NHCAA) — not invented on the fly.",
  "A claim never gets auto-approved on a hunch — only when it's clean and the system's confidence in that read clears a real bar.",
  'Every action taken on a claim — approved, denied, escalated — is permanently logged in the Audit Log.',
  'ClaimsDock reads real CMS-1500 and UB-04 forms — the actual documents providers file, not a simplified stand-in.',
  "A single hospital visit can generate two separate claims — one for the physician, one for the facility. ClaimsDock catches when they don't agree with each other.",
  'Not every red flag means fraud. ClaimsDock distinguishes an honest coding ambiguity from something that actually warrants investigation.',
  'Every fraud category ClaimsDock checks for traces back to a real, cited source — not a guess at what fraud might look like.',
  "Severity isn't just dollar amount — it also factors in how close a claim is to breaching its own deadline.",
  'Denying a claim takes four separate justifications, not one blob of text — the specific reason, the policy provision, the internal standard applied, and what could reverse it.',
  'Anchor remembers your last question — ask a follow-up like "what about that one" and it knows what that means.',
  'Anchor can act on more than one claim at a time — ask it to draft a denial for several flagged claims at once.',
  "ClaimsDock's document search runs on locally-hosted embeddings — no claim data is sent to a third party just to answer a policy question.",
];

const FADE_S = 0.5;
const HOLD_S = 7;
const PER_SLOT_S = FADE_S + HOLD_S + FADE_S;
const TOTAL_S = FACTS.length * PER_SLOT_S;

// One shared keyframe, expressed as a fraction of the *entire* loop, reused
// by every fact via a per-item positive animation-delay (i * PER_SLOT_S) —
// the standard pure-CSS-carousel technique. Computed from FACTS.length
// rather than hardcoded, so this stays correct if a fact is ever added or
// removed without anyone needing to hand-recompute percentages.
const fadeInEndPct = (FADE_S / TOTAL_S) * 100;
const fadeOutStartPct = ((PER_SLOT_S - FADE_S) / TOTAL_S) * 100;
const slotEndPct = (PER_SLOT_S / TOTAL_S) * 100;

const KEYFRAMES_CSS = `
@keyframes factSlot {
  0% { opacity: 0; }
  ${fadeInEndPct}% { opacity: 1; }
  ${fadeOutStartPct}% { opacity: 1; }
  ${slotEndPct}% { opacity: 0; }
  100% { opacity: 0; }
}
`;

export default function Loading() {
  // Randomized once per request, server-side — no client JS needed to pick
  // an order, so there's nothing for a slow-hydration scenario to break.
  const order = shuffledOrder(FACTS.length);

  return (
    <div className={styles.wrap}>
      <div role="img" aria-label="ClaimsDock" className={styles.logo} />

      <p className={styles.tagline}>
        ClaimsDock is a medical claims adjudication tool powered by the{' '}
        <AnchorLogo height={30} />
        <span className={styles.srOnly}>Anchor</span> copilot.
      </p>

      <div className={styles.shimmerRow} aria-hidden="true">
        <div className={styles.shimmerBar} style={{ width: '100%' }} />
        <div className={styles.shimmerBar} style={{ width: '83%' }} />
        <div className={styles.shimmerBar} style={{ width: '34%', marginLeft: '33%' }} />
        <div className={styles.shimmerBar} style={{ width: '83%', marginLeft: '17%' }} />
        <div className={styles.shimmerBar} style={{ width: '100%' }} />
      </div>

      <p className={styles.status}>
        ClaimsDock is running the evaluation pipeline for new claims —<br />
        this may take a few minutes. Later loads this week will be instant.
      </p>

      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES_CSS }} />
      {/* Decorative trivia, not load-bearing information — the status line
          above already says what's actually happening. All facts are
          simultaneously present in the DOM (only CSS opacity distinguishes
          them), so a screen reader reading this container by its own
          content rather than skipping it would hear all of them
          back-to-back with no useful signal — aria-hidden avoids that. */}
      <div className={styles.factStack} aria-hidden="true">
        {order.map((factIndex, position) => (
          <p
            key={factIndex}
            className={styles.factItem}
            style={{ animationDelay: `${position * PER_SLOT_S}s`, animationDuration: `${TOTAL_S}s` }}
          >
            {FACTS[factIndex]}
          </p>
        ))}
      </div>
    </div>
  );
}
