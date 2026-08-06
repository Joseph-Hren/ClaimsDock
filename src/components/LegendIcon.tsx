'use client';

import Popover from './Popover';
import { InfoIconGlyph } from './BadgeIcons';
import { StatusBadge, SeverityBadge, ConfidenceBadge } from './Badge';
import styles from './LegendIcon.module.css';
import type { ClaimStatus } from '../lib/rules/status';
import type { SeverityBand } from '../lib/rules/severity';
import type { ConfidenceTier } from '../lib/rules/action-lookup';

const STATUS_KEY: { status: ClaimStatus; isAutoApproved?: boolean; description: string }[] = [
  { status: 'Submitted, no flags', description: 'Passed initial evaluation, not yet approved.' },
  { status: 'Resolved', isAutoApproved: true, description: 'Clean, confident AI judgement, approved by default.' },
  { status: 'Resolved', isAutoApproved: false, description: 'Approved or otherwise closed by human action.' },
  { status: 'Needs Approval', description: 'Clean, but AI judgement requires human approval.' },
  { status: 'Submitted, flagged', description: 'Issue found; human judgement needed.' },
  { status: 'Additional Info Requested', description: 'On hold, missing required field; SLA paused until the correction is made.' },
  { status: 'Escalated', description: 'Routed to a higher level of review.' },
  { status: 'Denied', description: 'Formally rejected with required reasoning on file.' },
  { status: 'Recoupment Requested', description: 'Process has begun to recoup reimbursement for an approved claim.' },
];

const SEVERITY_KEY: { severity: SeverityBand; description: string }[] = [
  { severity: 'Low', description: 'Small dollar amount, low deadline pressure.' },
  { severity: 'Moderate', description: 'Moderate dollar amount, or SLA deadline starting to approach, some time pressure.' },
  { severity: 'High', description: 'Large dollar amount, a disputed medical-necessity question, or a deadline closing in.' },
  { severity: 'Critical', description: 'Very large dollar amount, imminent deadline, or deadline already breached.' },
];

const CONFIDENCE_KEY: { confidence: ConfidenceTier; description: string }[] = [
  { confidence: 'High Confidence', description: 'Multiple independent signals converge on the same conclusion.' },
  { confidence: 'Confident', description: 'A clear, direct match; nothing contradicts it.' },
  { confidence: 'Suspected', description: 'Partial or ambiguous pattern; plausible, not clean.' },
  { confidence: 'Uncertain', description: 'Minimal support or conflicting signals.' },
];

const KEY_TITLES = {
  status: 'Claim status key',
  severity: 'Claim severity key',
  confidence: 'AI confidence key',
} as const;

export default function LegendIcon({ kind, align = 'left' }: { kind: keyof typeof KEY_TITLES; align?: 'left' | 'right' }) {
  return (
    <Popover
      trigger="hover"
      align={align}
      label={`${KEY_TITLES[kind]} — hover, tap, or focus for details`}
      content={
        <div className={styles.legend}>
          <h3 className={styles.title}>{KEY_TITLES[kind]}</h3>
          <ul className={styles.list}>
            {kind === 'status' &&
              STATUS_KEY.map((entry, i) => (
                <li key={i} className={styles.item}>
                  <StatusBadge status={entry.status} isAutoApproved={entry.isAutoApproved} className={styles.legendBadge} />
                  <span className={styles.itemDescription}>{entry.description}</span>
                </li>
              ))}
            {kind === 'severity' &&
              SEVERITY_KEY.map((entry) => (
                <li key={entry.severity} className={styles.item}>
                  <SeverityBadge severity={entry.severity} className={styles.legendBadge} />
                  <span className={styles.itemDescription}>{entry.description}</span>
                </li>
              ))}
            {kind === 'confidence' &&
              CONFIDENCE_KEY.map((entry) => (
                <li key={entry.confidence} className={styles.item}>
                  <ConfidenceBadge confidence={entry.confidence} className={styles.legendBadge} />
                  <span className={styles.itemDescription}>{entry.description}</span>
                </li>
              ))}
          </ul>
        </div>
      }
    >
      <span className={styles.icon}>
        <InfoIconGlyph size={14} />
      </span>
    </Popover>
  );
}
