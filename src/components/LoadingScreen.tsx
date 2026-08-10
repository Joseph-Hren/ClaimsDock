'use client';

import { useEffect, useState } from 'react';
import { AnchorLogo } from './ChromeIcons';
import { shuffledOrder } from '../lib/ui/fact-cycler';
import styles from './LoadingScreen.module.css';

// The branded "still loading" screen — originally app/loading.tsx, Next's
// own automatic Suspense fallback for the homepage's Server Component
// (page.tsx awaited buildDashboardRows() directly). Moved here 2026-08-10
// once page.tsx stopped awaiting anything itself (progressive loading moved
// that wait client-side, into DashboardLoader.tsx): a components/ file
// importing a page-level component out of app/ inverts this project's own
// file-structure rule (app/ wires up components/, never the other way), so
// this is now the real implementation, imported directly by both
// DashboardLoader (as the client-side "nothing loaded yet" state) and
// app/loading.tsx (kept as a thin re-export — still a valid fallback for
// Next's own convention, in case any future route segment genuinely
// suspends again).
//
// The fact ORDER is now picked post-mount, in a useEffect, not during the
// initial render — DashboardLoader (a real client component) means this
// renders through a genuine SSR-then-hydrate pass now, unlike its old life
// as a Suspense fallback that was thrown away rather than reconciled.
// Picking a random order during the initial render produced a real
// hydration-mismatch error (server and client each called Math.random()
// independently and got different orders) the first time this ran inside
// that tree. Facts render in a fixed, identity order for one frame at
// mount, then reshuffle — imperceptible against the many-second cold loads
// this screen is actually shown for. The cycling itself is still pure CSS
// (a static @keyframes rule, per-item animation-delay only) — see git
// history on the old app/loading.tsx for the two live production
// regressions that led here (a useEffect-driven version that froze
// mid-Suspense-stream, then a dynamically-injected <style> tag that
// produced byte-correct HTML that still didn't render visibly).

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

// Per-item spacing only — the shared keyframe's own percentages (and its
// matching 152s duration) are a static rule in LoadingScreen.module.css, not
// computed here. This constant must keep matching FACTS.length *
// PER_SLOT_S exactly, or an item's delay could exceed the shared
// animation's own duration and land it a full cycle off from where it
// belongs — checked below, dev-only, since a silent drift here wouldn't
// throw, it would just make the cycling look subtly wrong.
const PER_SLOT_S = 8;
const EXPECTED_TOTAL_S = 152;

if (process.env.NODE_ENV !== 'production' && FACTS.length * PER_SLOT_S !== EXPECTED_TOTAL_S) {
  throw new Error(
    `LoadingScreen.tsx: FACTS.length (${FACTS.length}) * PER_SLOT_S (${PER_SLOT_S}) must equal EXPECTED_TOTAL_S ` +
      `(${EXPECTED_TOTAL_S}), which must in turn match .factItem's hardcoded animation-duration in ` +
      `LoadingScreen.module.css. Update both together if a fact is ever added or removed.`,
  );
}

export default function LoadingScreen() {
  // Identity order on the initial render (matches server and client alike,
  // avoiding the hydration mismatch a random initial order produced), then
  // shuffled once, client-side, immediately after mount.
  const [order, setOrder] = useState<number[]>(() => Array.from({ length: FACTS.length }, (_, i) => i));
  useEffect(() => {
    const timer = setTimeout(() => setOrder(shuffledOrder(FACTS.length)), 0);
    return () => clearTimeout(timer);
  }, []);

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
        this may take a few minutes, usually about 160 seconds. Later loads this week will be instant.
      </p>

      {/* Decorative trivia, not load-bearing information — the status line
          above already says what's actually happening. All facts are
          simultaneously present in the DOM (only CSS opacity distinguishes
          them), so a screen reader reading this container by its own
          content rather than skipping it would hear all of them
          back-to-back with no useful signal — aria-hidden avoids that. */}
      <div className={styles.factStack} aria-hidden="true">
        {order.map((factIndex, position) => (
          <p key={factIndex} className={styles.factItem} style={{ animationDelay: `${position * PER_SLOT_S}s` }}>
            {FACTS[factIndex]}
          </p>
        ))}
      </div>
    </div>
  );
}
