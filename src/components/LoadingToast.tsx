'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './LoadingToast.module.css';
import { InfoIconGlyph, AutoApprovedIcon } from './BadgeIcons';

// Timing spec, exact (2026-08-10): 0.6s delay before sliding into view over
// 0.8s, then slides back out over 0.8s. Both toasts (loading and complete)
// share this lifecycle — only the copy/color/icon/hold-duration differ.
const ENTER_DELAY_MS = 600;
const SLIDE_MS = 800;

export type ToastKind = 'loading' | 'complete';
type Phase = 'hidden' | 'visible' | 'exiting';

const HOLD_MS: Record<ToastKind, number> = {
  loading: 12000,
  complete: 10000,
};

const COPY: Record<ToastKind, { text: string; Icon: typeof InfoIconGlyph }> = {
  // Icons deliberately reused from real badge usage, not a generic
  // info/check glyph — InfoIconGlyph is the same icon Additional Info
  // Requested's own badge uses; AutoApprovedIcon is the same icon a
  // Resolved-and-auto-approved badge uses. Colors are the toast's own
  // (badge-blue / badge-green tokens), independent of which badge those
  // icons normally appear in.
  loading: { text: 'Pipeline evaluation in progress. Not all claims have finished loading.', Icon: InfoIconGlyph },
  complete: { text: 'Pipeline evaluation complete. All claims have loaded.', Icon: AutoApprovedIcon },
};

export default function LoadingToast({ kind, onDismissed }: { kind: ToastKind; onDismissed: () => void }) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  useEffect(() => {
    setPhase('hidden');
    const enter = setTimeout(() => setPhase('visible'), ENTER_DELAY_MS);
    timers.current = [enter];
    return () => timers.current.forEach(clearTimeout);
  }, [kind]);

  useEffect(() => {
    if (phase !== 'visible') return;
    const t = setTimeout(() => setPhase('exiting'), HOLD_MS[kind]);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [phase, kind]);

  useEffect(() => {
    if (phase !== 'exiting') return;
    const t = setTimeout(() => onDismissedRef.current(), SLIDE_MS);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [phase]);

  // Skips straight to the exit animation regardless of how long the toast
  // has actually been visible — the hold-duration timer above is still
  // pending at this point, but its effect's own cleanup (phase changing
  // away from 'visible') cancels it before it can fire.
  function handleClose() {
    timers.current.forEach(clearTimeout);
    setPhase('exiting');
  }

  const { text, Icon } = COPY[kind];

  return (
    <div className={`${styles.wrap} ${styles[kind]} ${phase === 'visible' ? styles.shown : ''}`} role="status">
      <div className={styles.inner}>
        <div className={styles.left}>
          <Icon size={16} />
          <p className={styles.message}>{text}</p>
        </div>
        <button className={styles.closeButton} onClick={handleClose} aria-label="Dismiss">
          <span className={styles.closeLabel}>Dismiss</span>
          <span className={styles.closeX}>×</span>
        </button>
      </div>
    </div>
  );
}
