'use client';

import styles from './WorkflowDiagramModal.module.css';

export default function WorkflowDiagramModal({ onClose, closing }: { onClose: () => void; closing: boolean }) {
  return (
    <div className={`${styles.frame} ${closing ? styles.closing : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>ClaimsDock workflow diagram</span>
        <button className={styles.close} onClick={onClose} aria-label="Close">
          Close ×
        </button>
      </div>
      <iframe src="/workflow-diagram.html" title="ClaimsDock workflow diagram" className={styles.iframe} />
    </div>
  );
}
