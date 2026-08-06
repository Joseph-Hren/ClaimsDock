import { Button } from './Button';
import styles from './BulkActionBar.module.css';
import type { BulkBarState } from '../lib/ui/bulk-actions';

// assets/BulkActionBar-*.svg reference — replaces the list header row while
// any row is selected. Real bulk actions now (2026-08-06, see
// lib/ui/bulk-actions.ts): `state` already reflects exactly one button, a
// sequential queue, or a "nothing available" message, computed once by
// Dashboard from the current selection — this component just renders it.
export default function BulkActionBar({
  count,
  state,
  onAction,
  onCancel,
}: {
  count: number;
  state: BulkBarState;
  onAction: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.bar}>
      <span className={styles.count}>{count} selected</span>
      <div className={styles.actions}>
        {state.kind === 'none' ? (
          <span className={styles.unavailable}>{state.message}</span>
        ) : (
          <Button kind="primary" onClick={onAction}>
            {state.label}
          </Button>
        )}
        <Button kind="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
