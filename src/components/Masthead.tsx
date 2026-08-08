'use client';

import styles from './Masthead.module.css';
import { AccountIcon, SettingsSlidersIcon, DiagramIcon } from './ChromeIcons';

export default function Masthead({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className={styles.masthead}>
      {/* The visible logo is an image, not text, so the page has no real
          heading anywhere without this — added as a visually-hidden h1
          rather than changing the logo's own presentation (2026-08-07,
          accessibility audit). */}
      <h1 className={styles.srOnly}>ClaimsDock — Claims Dashboard</h1>
      {/* Real ClaimsDock logo, not the style font — the masthead bar is
          always dark across all 6 style/mode combos, so one white-on-dark
          logo asset covers every case; nothing to swap on style change. */}
      <img src="/claimsdock-logo.svg" alt="ClaimsDock" className={styles.logo} />
      <div className={styles.icons}>
        {/* All three icons duplicate the same behavior on purpose — each
            opens Settings, same as the account/settings pair already did. */}
        <button className={styles.iconButton} aria-label="Account" onClick={onOpenSettings}>
          <AccountIcon />
        </button>
        <button className={styles.iconButton} aria-label="How ClaimsDock works" onClick={onOpenSettings}>
          <DiagramIcon />
        </button>
        <button className={styles.iconButton} aria-label="Open appearance settings" onClick={onOpenSettings}>
          <SettingsSlidersIcon />
        </button>
      </div>
    </header>
  );
}
