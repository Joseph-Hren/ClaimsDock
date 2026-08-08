'use client';

import styles from './Pagination.module.css';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function ChevronIcon({ direction }: { direction: 'left' | 'right' | 'down' }) {
  const rotation = direction === 'left' ? 'scaleX(-1)' : direction === 'down' ? 'rotate(90deg)' : undefined;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ transform: rotation }}>
      <path d="M5.5 3.5 9 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  // Numbered pages, collapsing to an ellipsis once there are more than 5 —
  // always show page 1, the last page, and a window around the current one.
  const pageNumbers: (number | 'ellipsis')[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 1) pageNumbers.push(i);
    else if (pageNumbers[pageNumbers.length - 1] !== 'ellipsis') pageNumbers.push('ellipsis');
  }

  return (
    <div className={styles.row}>
      <div className={styles.left}>
        <span>Items per page</span>
        <span className={styles.selectWrap}>
          <select
            className={styles.pageSizeSelect}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Items per page"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          {/* The native <select> arrow ignores CSS padding entirely (it's
              drawn by the browser in its own fixed gutter) — appearance:none
              turns it off so this real, positionable chevron can replace it. */}
          <span className={styles.selectChevron}>
            <ChevronIcon direction="down" />
          </span>
        </span>
        <span>
          Showing {start}–{end} of {total}
        </span>
      </div>

      <div className={styles.right}>
        <button className={styles.arrow} disabled={page === 0} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronIcon direction="left" />
        </button>
        {pageNumbers.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${i}`} className={styles.ellipsis}>
              …
            </span>
          ) : (
            <button
              key={p}
              className={`${styles.pageNumber} ${p === page ? styles.pageNumberActive : ''}`}
              onClick={() => onPageChange(p)}
            >
              {p + 1}
            </button>
          ),
        )}
        <button className={styles.arrow} disabled={page >= pageCount - 1} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronIcon direction="right" />
        </button>
      </div>
    </div>
  );
}
