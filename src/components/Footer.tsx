'use client';

import styles from './Footer.module.css';
import { ClaimsDockLogo } from './ChromeIcons';

const LINKEDIN_URL = 'https://www.linkedin.com/in/joseph-hren/';

export default function Footer({ onOpenDiagram }: { onOpenDiagram: () => void }) {
  return (
    <footer className={styles.footer}>
      <span className={styles.logo}>
        <ClaimsDockLogo height={18} />
      </span>
      <span className={styles.copyright}>&copy; Copyright 2026 by Joseph Hren</span>
      <nav className={styles.links}>
        <a className={styles.link} href="https://jrhren.com" target="_blank" rel="noopener noreferrer">
          jrhren.com
        </a>
        <a className={styles.link} href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
          LinkedIn
        </a>
        <button type="button" className={styles.link} onClick={onOpenDiagram}>
          System Diagram
        </button>
      </nav>
    </footer>
  );
}
