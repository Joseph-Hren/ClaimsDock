'use client';

import { useEffect, useState } from 'react';
import { AnchorLogo } from '../components/ChromeIcons';
import { startFactCyclePolling } from './fact-cycler';
import styles from './loading.module.css';

// Next.js's automatic Suspense boundary for the async Home page below
// (page.tsx now awaits buildDashboardRows()). Only actually seen on an
// uncached ISO week — real live model calls, realistically 20-60+ seconds;
// every load after that hits Phase 7's per-ISO-week cache and never reaches
// this at all.

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

export default function Loading() {
  const [factIndex, setFactIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Derived from elapsed wall-clock time (persisted in sessionStorage),
    // not a chain of setTimeout calls — see fact-cycler.ts for why.
    return startFactCyclePolling(FACTS.length, ({ factIndex, visible }) => {
      setFactIndex(factIndex);
      setVisible(visible);
    });
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
        this may take a few minutes. Later loads this week will be instant.
      </p>

      <p className={`${styles.fact} ${visible ? styles.factVisible : ''}`} aria-live="polite">
        {FACTS[factIndex]}
      </p>
    </div>
  );
}
