'use client';

import { useMemo, useState } from 'react';
import styles from './ClaimsTable.module.css';
import LegendIcon from './LegendIcon';
import { StatusBadge, SeverityBadge } from './Badge';
import { SearchIcon, ClearIcon } from './ChromeIcons';
import Pagination from './Pagination';
import Checkbox from './Checkbox';
import BulkActionBar from './BulkActionBar';
import type { DashboardClaimRow } from '../lib/ui/dashboard-rows';
import type { BulkBarState } from '../lib/ui/bulk-actions';
import type { ClaimStatus } from '../lib/rules/status';
import type { SeverityBand } from '../lib/rules/severity';

function formatAmount(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function slaPercentLabel(row: DashboardClaimRow): string {
  if (row.sla.isBreached) return 'Breached';
  const pct = Math.round(row.sla.percentRemaining * 100);
  return `${pct}%`;
}

// Lifecycle position, not alphabetical — an enum sorted A-Z would be
// meaningless here (e.g. "Denied" before "Escalated" says nothing real).
const STATUS_RANK: Record<ClaimStatus, number> = {
  'Submitted, no flags': 0,
  'Submitted, flagged': 1,
  'Needs Approval': 2,
  'Additional Info Requested': 3,
  Escalated: 4,
  Denied: 5,
  Resolved: 6,
  'Recoupment Requested': 7,
};

const SEVERITY_RANK: Record<SeverityBand, number> = { Low: 0, Moderate: 1, High: 2, Critical: 3 };

type SortKey = 'claim_id' | 'patient' | 'provider' | 'amount' | 'status' | 'severity' | 'sla';
type SortDir = 'asc' | 'desc';

const SORT_VALUE: Record<SortKey, (row: DashboardClaimRow) => number | string> = {
  claim_id: (r) => r.displayNumber,
  patient: (r) => r.patientName,
  provider: (r) => r.providerName,
  amount: (r) => r.claim.total_charge,
  status: (r) => STATUS_RANK[r.status],
  severity: (r) => SEVERITY_RANK[r.severity],
  sla: (r) => r.sla.percentRemaining,
};

function SortCaret({ direction }: { direction: SortDir | null }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={styles.caret}>
      {direction !== 'asc' && <path d="M2.25 4.5 6 8.25 9.75 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
      {direction !== 'desc' && <path d="M2.25 7.5 6 3.75 9.75 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

// Split into a label button and a separate caret button (rather than one
// button wrapping both) so a column that also has a legend icon — Status,
// Severity — can put that icon between them without nesting it inside a
// clickable sort area. Both halves trigger the same sort.
function SortLabel({ sortKey, onSort, children }: { sortKey: SortKey; onSort: (key: SortKey) => void; children: React.ReactNode }) {
  return (
    <button className={styles.sortLabel} onClick={() => onSort(sortKey)}>
      {children}
    </button>
  );
}

function SortCaretButton({
  sortKey,
  activeSort,
  onSort,
}: {
  sortKey: SortKey;
  activeSort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeSort?.key === sortKey;
  return (
    <button className={styles.sortCaretButton} onClick={() => onSort(sortKey)} aria-label={`Sort by ${sortKey}`}>
      <SortCaret direction={isActive ? activeSort.dir : null} />
    </button>
  );
}

function SortableHeader({
  sortKey,
  activeSort,
  onSort,
  children,
}: {
  sortKey: SortKey;
  activeSort: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
}) {
  return (
    <span className={styles.sortGroup}>
      <SortLabel sortKey={sortKey} onSort={onSort}>
        {children}
      </SortLabel>
      <SortCaretButton sortKey={sortKey} activeSort={activeSort} onSort={onSort} />
    </span>
  );
}

export default function ClaimsTable({
  rows,
  onOpenClaim,
  selected,
  onSelectedChange,
  bulkBarState,
  onBulkAction,
}: {
  rows: DashboardClaimRow[];
  onOpenClaim: (row: DashboardClaimRow) => void;
  /** Lifted to Dashboard (2026-08-06) — both the bulk-actions bar and
   *  Anchor's own awareness of a checkbox selection need this above
   *  ClaimsTable, not just inside it. */
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  bulkBarState: BulkBarState;
  onBulkAction: () => void;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  function toggleSelected(claimId: string) {
    const next = new Set(selected);
    if (next.has(claimId)) next.delete(claimId);
    else next.add(claimId);
    onSelectedChange(next);
  }

  function handleSort(key: SortKey) {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    setPage(0);
  }

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.displayNumber.toLowerCase().includes(q) || r.patientName.toLowerCase().includes(q) || r.providerName.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const getValue = SORT_VALUE[sort.key];
    const dirMultiplier = sort.dir === 'asc' ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va < vb) return -1 * dirMultiplier;
      if (va > vb) return 1 * dirMultiplier;
      return 0;
    });
  }, [filteredRows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sortedRows.slice(currentPage * pageSize, currentPage * pageSize + pageSize);

  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.claim.claim_id));
  const someOnPageSelected = pageRows.some((r) => selected.has(r.claim.claim_id));

  function toggleSelectAllOnPage() {
    const next = new Set(selected);
    if (allOnPageSelected) {
      pageRows.forEach((r) => next.delete(r.claim.claim_id));
    } else {
      pageRows.forEach((r) => next.add(r.claim.claim_id));
    }
    onSelectedChange(next);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.listHeader}>
        <h2 className={styles.listTitle}>Claims List</h2>
        <div className={styles.searchBar}>
          <SearchIcon />
          <input
            className={styles.searchInput}
            placeholder="Search claims, patients, providers…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          {query.length > 0 && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => {
                setQuery('');
                setPage(0);
              }}
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <BulkActionBar count={selected.size} state={bulkBarState} onAction={onBulkAction} onCancel={() => onSelectedChange(new Set())} />
      )}

      <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
            <th className={styles.checkboxCell}>
              <Checkbox
                aria-label="Select all claims on this page"
                checked={allOnPageSelected}
                indeterminate={someOnPageSelected && !allOnPageSelected}
                onChange={toggleSelectAllOnPage}
              />
            </th>
            <th>
              <SortableHeader sortKey="claim_id" activeSort={sort} onSort={handleSort}>
                Claim #
              </SortableHeader>
            </th>
            <th>
              <SortableHeader sortKey="patient" activeSort={sort} onSort={handleSort}>
                Patient
              </SortableHeader>
            </th>
            <th>
              <SortableHeader sortKey="provider" activeSort={sort} onSort={handleSort}>
                Provider
              </SortableHeader>
            </th>
            <th className={styles.linkedCell}>Linked</th>
            <th>
              <SortableHeader sortKey="amount" activeSort={sort} onSort={handleSort}>
                Amount
              </SortableHeader>
            </th>
            <th>
              <span className={styles.headerLabel}>
                <SortLabel sortKey="status" onSort={handleSort}>
                  Status
                </SortLabel>
                <LegendIcon kind="status" align="right" />
                <SortCaretButton sortKey="status" activeSort={sort} onSort={handleSort} />
              </span>
            </th>
            <th>
              <span className={styles.headerLabel}>
                <SortLabel sortKey="severity" onSort={handleSort}>
                  Severity
                </SortLabel>
                <LegendIcon kind="severity" align="right" />
                <SortCaretButton sortKey="severity" activeSort={sort} onSort={handleSort} />
              </span>
            </th>
            <th>
              <SortableHeader sortKey="sla" activeSort={sort} onSort={handleSort}>
                SLA
              </SortableHeader>
            </th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => (
            <tr key={row.claim.claim_id} className={styles.row} onClick={() => onOpenClaim(row)}>
              <td className={styles.checkboxCell} onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  aria-label={`Select claim ${row.displayNumber}`}
                  checked={selected.has(row.claim.claim_id)}
                  onChange={() => toggleSelected(row.claim.claim_id)}
                />
              </td>
              <td className={styles.mono}>{row.displayNumber}</td>
              <td className={styles.truncatePatient}>{row.patientName}</td>
              <td className={styles.truncate}>{row.providerName}</td>
              <td className={`${styles.mono} ${styles.linkedCell}`}>{row.linkedDisplayNumber ?? '—'}</td>
              <td className={styles.mono}>{formatAmount(row.claim.total_charge)}</td>
              <td className={styles.statusCell}>
                <StatusBadge status={row.status} isAutoApproved={row.isAutoApproved} />
              </td>
              <td>
                <SeverityBadge severity={row.severity} />
              </td>
              <td className={row.sla.isBreached ? styles.slaBreached : undefined}>
                {slaPercentLabel(row)}
                {!row.sla.isBreached && <span className={styles.slaRemainingWord}> remaining</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <Pagination
        page={currentPage}
        pageCount={pageCount}
        pageSize={pageSize}
        total={sortedRows.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(0);
        }}
      />
    </div>
  );
}
