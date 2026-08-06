'use client';

import { useEffect, useRef } from 'react';
import styles from './Checkbox.module.css';

function CheckIcon() {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true">
      <path d="M1 4.5 4 7.5 10 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg width="10" height="2" viewBox="0 0 10 2" fill="none" aria-hidden="true">
      <path d="M1 1h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Header "select all on page" state — some but not all rows selected.
   * Renders as a dash rather than a checkmark. A single row is always
   * either selected or not; only this kind of checkbox can be indeterminate. */
  indeterminate?: boolean;
}

export default function Checkbox({ indeterminate = false, checked, ...props }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // The native indeterminate state has no JSX prop of its own — unlike
  // checked/unchecked, it can only be set imperatively on the DOM node.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    // A <label> wrapping both the input and its visual box forwards clicks
    // to the input automatically — the robust fix, not reliant on precise
    // pointer-events behavior (which the box also sets, as a second layer:
    // the previous version had neither, so the box — being later in DOM
    // order — silently absorbed every click *and* every hover before either
    // ever reached the real input underneath it).
    <label className={styles.wrap}>
      <input ref={inputRef} type="checkbox" className={styles.input} checked={checked || indeterminate} {...props} />
      <span className={styles.highlight} />
      <span className={styles.box}>{indeterminate ? <DashIcon /> : <CheckIcon />}</span>
    </label>
  );
}
