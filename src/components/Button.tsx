import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonKind = 'primary' | 'secondary' | 'primary-warning' | 'secondary-warning';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ButtonKind;
}

/**
 * The shared button component (assets/button.svg) — five kinds × rest/hover,
 * per style/mode. Rest-state colors are pulled directly from the component's
 * real token bindings (accent/accent-ink, bg-field/border-strong/ink-primary,
 * status-critical-text), so those are exact. Hover is an approximation, not
 * a per-variant hex match: the Figma set's actual hover colors turn out to be
 * hand-picked per style rather than one computed rule (e.g. Ledger-light
 * primary hover isn't just "accent, darker" — the hue shifts slightly), and
 * the set is still incomplete (no dark-mode primary-warning hover exists
 * yet). Rather than freeze on a moving target, hover here uses one
 * consistent, defensible rule per kind — worth a real pixel-check once the
 * component is finalized on your end.
 */
export function Button({ kind = 'primary', className, ...props }: ButtonProps) {
  return <button className={`${styles.button} ${styles[toClassName(kind)]} ${className ?? ''}`} {...props} />;
}

function toClassName(kind: ButtonKind): string {
  return kind.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
