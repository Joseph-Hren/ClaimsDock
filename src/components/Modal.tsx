'use client';

import { type ReactNode } from 'react';
import styles from './Modal.module.css';

/**
 * Shared shade — one element, not one per layer. Its z-index is set by the
 * caller depending on which layer is currently "active": sitting just below
 * the card when the card is the topmost thing, or just below a sub-overlay
 * (and therefore *above* the card, dimming it) once one opens. This is what
 * keeps a card+overlay stack from double-darkening the way two independent
 * backdrops would.
 */
export function Shade({ z, closing, onClick }: { z: number; closing?: boolean; onClick?: () => void }) {
  return <div className={`${styles.shade} ${closing ? styles.closing : ''}`} style={{ zIndex: z }} onClick={onClick} />;
}

export function ModalLayer({
  z,
  children,
  wide = false,
  closing = false,
}: {
  z: number;
  children: ReactNode;
  wide?: boolean;
  closing?: boolean;
}) {
  return (
    <div className={`${styles.layer} ${wide ? styles.layerWide : ''} ${closing ? styles.closing : ''}`} style={{ zIndex: z }}>
      {children}
    </div>
  );
}
