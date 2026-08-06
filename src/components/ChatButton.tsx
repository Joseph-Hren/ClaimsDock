import type { ButtonHTMLAttributes } from 'react';
import styles from './ChatButton.module.css';

// Arrow glyph traced from the button component set (assets/button.svg,
// "chat" variant) — a real drawn vector, not the text character below.
function ArrowIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12.125" fill="none" aria-hidden="true">
      <path d="M 5 0 L 10 6 L 6.5 6 L 6.5 11 C 6.5 12.5 3.5 12.5 3.5 11 L 3.5 6 L 0 6 L 5 0 Z" fill="currentColor" />
    </svg>
  );
}

// The original send-button glyph, kept here rather than deleted — Joseph
// said he might switch back to this arrow specifically, so this is the
// exact markup to restore if so: swap <ArrowIcon /> below for the line
// commented out in ChatButton's return.
// const legacyArrow = '↑';

export default function ChatButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={styles.chat} {...props}>
      <ArrowIcon />
      {/* legacyArrow */}
    </button>
  );
}
