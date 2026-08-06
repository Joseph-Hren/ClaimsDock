'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import SlidingToggle from './SlidingToggle';
import styles from './StatTiles.module.css';
import type { DashboardClaimRow } from '../lib/ui/dashboard-rows';
import { submittedWithinRange, breachingWithinRange, type StatRange } from '../lib/ui/stat-range';

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
];

// Plain-language form of whichever range is currently selected, for the
// empty-state message — "No claims flagged today" vs "...in the last 7
// days" vs "...in the last 30 days", so the message never says "today"
// while a longer range is actually selected.
function rangeText(range: StatRange): string {
  if (range === 'today') return 'today';
  if (range === '7d') return 'in the last 7 days';
  return 'in the last 30 days';
}

type Tint = 'good' | 'warning' | 'critical' | 'info';

function StatTile({
  tint,
  label,
  rows,
  now,
  filterRows,
  emptyLabel,
}: {
  tint: Tint;
  label: string;
  rows: DashboardClaimRow[];
  now: Date;
  /** Each tile defines its own range semantics — not a single shared rule,
   *  since "nearing SLA deadline" reads the range as "how soon" while the
   *  other three read it as "how recently submitted" (see stat-range.ts). */
  filterRows: (rows: DashboardClaimRow[], range: StatRange, now: Date) => DashboardClaimRow[];
  /** Takes the currently-selected range so the message can say "today" vs
   *  "in the last 7/30 days" to match — never a fixed string. */
  emptyLabel: (range: StatRange) => string;
}) {
  const [range, setRange] = useState<StatRange>('today');
  const count = filterRows(rows, range, now).length;
  return (
    <div className={`${styles.tile} ${styles[tint]}`}>
      {count > 0 ? (
        <div className={styles.numRow}>
          <span className={styles.count}>{count}</span>
          <span className={styles.label}>{label}</span>
        </div>
      ) : (
        <p className={styles.emptyLabel}>{emptyLabel(range)}</p>
      )}
      <SlidingToggle options={RANGE_OPTIONS} selected={range} onChange={(id) => setRange(id as StatRange)} size="small" />
    </div>
  );
}

export default function StatTiles({ rows }: { rows: DashboardClaimRow[] }) {
  const now = new Date();
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState<number | undefined>(undefined);
  // Same measured-height mechanism as ClaimsCard's own view-switch transition
  // (a separately-measured inner element inside an animated, clipped outer
  // frame), same --dur-height duration too — a toggle switching to a longer
  // empty-state message wraps to a second line, growing every tile at once
  // (they share a stretched height), and this smooths that jump into a real
  // transition instead of an instant snap.
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setGridHeight(el.scrollHeight);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div className={styles.gridWrap} style={{ height: gridHeight }}>
      <div ref={gridRef} className={styles.grid}>
        <StatTile
          tint="good"
          label="claims auto-approved"
          rows={rows}
          now={now}
          filterRows={(rows, range, now) => submittedWithinRange(rows, range, now).filter((r) => r.isAutoApproved)}
          emptyLabel={(range) => `No claims auto-approved ${rangeText(range)}`}
        />
        <StatTile
          tint="warning"
          label="claims flagged"
          rows={rows}
          now={now}
          filterRows={(rows, range, now) => submittedWithinRange(rows, range, now).filter((r) => r.status === 'Submitted, flagged')}
          emptyLabel={(range) => `No claims flagged ${rangeText(range)}`}
        />
        <StatTile
          tint="critical"
          label="claims suspected of fraud"
          rows={rows}
          now={now}
          filterRows={(rows, range, now) => submittedWithinRange(rows, range, now).filter((r) => r.category === 'fraud')}
          // "submitted" called out explicitly — claims suspected of fraud can
          // still exist elsewhere in the system even when none were newly
          // submitted in this window, and that distinction matters here.
          emptyLabel={(range) => `No claims suspected of fraud submitted ${rangeText(range)}`}
        />
        <StatTile
          tint="info"
          label="claims nearing SLA deadline"
          rows={rows}
          now={now}
          filterRows={(rows, range) => breachingWithinRange(rows, range)}
          emptyLabel={(range) => `No claims nearing SLA deadline ${rangeText(range)}`}
        />
      </div>
    </div>
  );
}
