import styles from './MiniCard.module.css';
import { StatusBadge, SeverityBadge } from './Badge';
import type { DashboardClaimRow } from '../lib/ui/dashboard-rows';
import { recommendationDisplayLabel } from '../lib/rules/status';

const CATEGORY_LABEL: Record<string, string> = {
  clean: 'Clean claim',
  ambiguous: 'Ambiguous claim',
  'missing-data': 'Missing required data',
  'complex-math': 'Complex coverage math',
  fraud: 'Suspected fraud pattern',
};

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function MiniCard({ row, onOpenCard }: { row: DashboardClaimRow; onOpenCard?: () => void }) {
  return (
    <button className={styles.card} onClick={onOpenCard} aria-label={`Open full card for claim ${row.displayNumber}`}>
      <div className={styles.badgeRow}>
        <StatusBadge status={row.status} isAutoApproved={row.isAutoApproved} />
        <SeverityBadge severity={row.severity} />
      </div>
      <p className={styles.summaryLine}>
        {row.displayNumber} — {row.patientName} — {formatAmount(row.claim.total_charge)}
      </p>
      <p className={styles.categoryLine}>{CATEGORY_LABEL[row.category]}</p>
      <p className={styles.recommendation}>
        Recommendation: <b>{recommendationDisplayLabel(row.recommendedAction, row.status)}</b>.
      </p>
      {/* The whole card is now the click target (button) — this stays as
          plain text, not a nested button, since interactive elements can't
          nest. Kept for the visual affordance, styled the same as before. */}
      <span className={styles.link}>View full card →</span>
    </button>
  );
}
