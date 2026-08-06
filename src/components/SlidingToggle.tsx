'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import styles from './SlidingToggle.module.css';

export interface ToggleOption {
  id: string;
  label: string;
  /** Rendered before the label — e.g. the sun/moon marks for brightness
   *  mode, or a model's brand mark. Omit for a text-only pill. */
  icon?: ReactNode;
  /** Escape hatch for a per-option override this generic toggle has no
   *  business knowing about — e.g. Appearance style's own labels needing to
   *  stay in the font they name (Ledger always Lora, Clinical always Karla,
   *  Field always Outfit) regardless of whichever style is currently active
   *  app-wide, rather than inheriting the ambient --font-body. */
  style?: CSSProperties;
}

interface SlidingToggleProps {
  options: ToggleOption[];
  selected: string;
  onChange: (id: string) => void;
  size?: 'default' | 'small';
}

/** Shared sliding-pill toggle — used by the Claims Card's view toggle and the
 * StatTile time-range toggle. The thumb's position/width is measured off the
 * actual selected button (not hardcoded fractions), so it works regardless
 * of how many options there are or how long their labels are. */
export default function SlidingToggle({ options, selected, onChange, size = 'default' }: SlidingToggleProps) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const el = buttonRefs.current[selected];
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [selected, options]);

  return (
    <div className={`${styles.track} ${size === 'small' ? styles.small : ''}`} role="tablist">
      {thumb && <div className={styles.thumb} style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }} />}
      {options.map((option) => (
        <button
          key={option.id}
          ref={(el) => {
            buttonRefs.current[option.id] = el;
          }}
          role="tab"
          aria-selected={option.id === selected}
          className={`${styles.pill} ${option.icon ? styles.pillIcon : ''} ${option.id === selected ? styles.pillActive : ''}`}
          style={option.style}
          onClick={() => onChange(option.id)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
