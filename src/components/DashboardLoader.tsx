'use client';

import { useEffect, useState } from 'react';
import Dashboard from './Dashboard';
import LoadingScreen from './LoadingScreen';
import type { DashboardClaimRow } from '../lib/ui/dashboard-rows';

// Real progressive-loading wiring (2026-08-10) — replaces page.tsx's old
// single blocking await of buildDashboardRows(). Polls /api/pipeline/progress
// (not true push/streaming — see the loading-time conversation this same
// session: at several seconds per chunk, a 3s poll is indistinguishable from
// a push, and polling avoids ReadableStream/connection-lifecycle edge cases
// on Vercel for a negligible perceived-latency cost). Shows the full branded
// LoadingScreen until the first chunk of real rows exists, then swaps to a
// live Dashboard that keeps growing in place as later chunks land.
const POLL_INTERVAL_MS = 3000;

interface ProgressResponse {
  rows: DashboardClaimRow[];
  totalExpected: number;
  isComplete: boolean;
}

export default function DashboardLoader() {
  const [rows, setRows] = useState<DashboardClaimRow[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch('/api/pipeline/progress');
        const data: ProgressResponse = await res.json();
        if (cancelled) return;
        setRows(data.rows);
        setIsComplete(data.isComplete);
        if (!data.isComplete) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        console.error('DashboardLoader: progress poll failed:', err);
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Full branded loading experience until there's actually something to
  // show — an empty Dashboard (masthead + stat tiles reading zero + an
  // empty table) would read as broken, not "loading."
  if (rows.length === 0 && !isComplete) {
    return <LoadingScreen />;
  }

  return <Dashboard rows={rows} isComplete={isComplete} />;
}
