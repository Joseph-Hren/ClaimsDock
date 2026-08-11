'use client';

import { useEffect } from 'react';
import { Button } from '../components/Button';
import styles from './error.module.css';

// Next.js error boundary for the homepage — without this, an Evaluation
// Pipeline failure (exhausted batch-completeness retries, a network error,
// etc.) would crash to a blank/dev-overlay page instead of something an
// adjuster could actually recover from. reset() re-renders page.tsx, which
// tries buildDashboardRows() again — the per-ISO-week cache means a retry
// costs nothing if a prior call this week already succeeded.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Homepage failed to load:', error);
  }, [error]);

  return (
    <div className={styles.wrap}>
      <p className={styles.title}>Couldn&rsquo;t load the claims worklist</p>
      <p className={styles.subtitle}>
        The Evaluation Pipeline didn&rsquo;t complete successfully. This can happen on a live model call — retrying usually
        resolves it.
      </p>
      <Button className={styles.retry} onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
