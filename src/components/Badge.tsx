import type { ClaimStatus } from '../lib/rules/status';
import type { SeverityBand } from '../lib/rules/severity';
import type { ConfidenceTier } from '../lib/rules/action-lookup';
import styles from './Badge.module.css';
import {
  CircleDotIcon,
  CheckIcon,
  WarningTriangleIcon,
  ExclaimCircleIcon,
  InfoIconGlyph,
  XBoxIcon,
  FilledDotIcon,
  AutoApprovedIcon,
  FlaggedIcon,
  RecoupmentIcon,
} from './BadgeIcons';

type Color = 'red' | 'flame' | 'amber' | 'yellow' | 'green' | 'blue' | 'violet' | 'lilac' | 'aqua';

// +2px over the shared 12px default on every icon here (14px) — the
// confidence dots (FilledDotIcon, called explicitly at its own size below)
// are deliberately excluded from that bump.
const BADGE_ICON_SIZE = 14;

const STATUS_VARIANT: Record<ClaimStatus, { color: Color; label: string; icon: typeof CheckIcon }> = {
  'Submitted, no flags': { color: 'blue', label: 'Submitted, no flags', icon: CircleDotIcon },
  'Submitted, flagged': { color: 'yellow', label: 'Submitted, flagged', icon: FlaggedIcon },
  'Needs Approval': { color: 'blue', label: 'Needs approval', icon: CircleDotIcon },
  'Additional Info Requested': { color: 'violet', label: 'Additional info requested', icon: InfoIconGlyph },
  Denied: { color: 'flame', label: 'Denied', icon: XBoxIcon },
  Escalated: { color: 'amber', label: 'Escalated', icon: WarningTriangleIcon },
  // Icon here is the non-auto-approved case; StatusBadge below swaps in
  // AutoApprovedIcon specifically when isAutoApproved is true.
  Resolved: { color: 'green', label: 'Resolved', icon: CheckIcon },
  // Its own color, not violet — Additional Info Requested (above) also used
  // violet, and the two badges read as the same color stacked in the UI
  // (found live, 2026-08-05).
  'Recoupment Requested': { color: 'lilac', label: 'Recoupment requested', icon: RecoupmentIcon },
};

const SEVERITY_VARIANT: Record<SeverityBand, { color: Color; icon: typeof CheckIcon }> = {
  Low: { color: 'blue', icon: CircleDotIcon },
  Moderate: { color: 'yellow', icon: WarningTriangleIcon },
  High: { color: 'amber', icon: WarningTriangleIcon },
  Critical: { color: 'red', icon: ExclaimCircleIcon },
};

const CONFIDENCE_VARIANT: Record<ConfidenceTier, { color: Color }> = {
  'High Confidence': { color: 'green' },
  // Its own color, not blue — Needs Approval (status) and Low (severity)
  // also use blue, and Confident read as the same color as those (found
  // live, 2026-08-05).
  Confident: { color: 'aqua' },
  Suspected: { color: 'yellow' },
  Uncertain: { color: 'red' },
};

export function StatusBadge({ status, isAutoApproved, className }: { status: ClaimStatus; isAutoApproved?: boolean; className?: string }) {
  const variant = STATUS_VARIANT[status];
  const Icon = status === 'Resolved' && isAutoApproved ? AutoApprovedIcon : variant.icon;
  const label = status === 'Resolved' ? (isAutoApproved ? 'Resolved: auto-approved' : 'Resolved: approved') : variant.label;
  return (
    <span className={`${styles.badge} ${styles[variant.color]} ${className ?? ''}`}>
      <Icon size={BADGE_ICON_SIZE} />
      {label}
    </span>
  );
}

export function SeverityBadge({ severity, className }: { severity: SeverityBand; className?: string }) {
  const variant = SEVERITY_VARIANT[severity];
  const Icon = variant.icon;
  return (
    <span className={`${styles.badge} ${styles[variant.color]} ${className ?? ''}`}>
      <Icon size={BADGE_ICON_SIZE} />
      {severity}
    </span>
  );
}

export function ConfidenceBadge({ confidence, className }: { confidence: ConfidenceTier | null; className?: string }) {
  if (!confidence) {
    return <span className={`${styles.badge} ${styles.violet} ${className ?? ''}`}>&mdash;</span>;
  }
  const variant = CONFIDENCE_VARIANT[confidence];
  return (
    <span className={`${styles.badge} ${styles[variant.color]} ${className ?? ''}`}>
      <FilledDotIcon size={10} />
      {confidence}
    </span>
  );
}
