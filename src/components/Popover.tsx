'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Popover.module.css';

export interface PopoverProps {
  trigger: 'hover' | 'click';
  /** The trigger element — an icon, typically. Must accept a ref-forwarding wrapper. */
  children: ReactNode;
  content: ReactNode;
  align?: 'left' | 'right';
  label?: string;
}

/**
 * Shared popover primitive for legends and Settings — drop-shadow only, no
 * scrim, anchored near its trigger. 'hover' also opens on click and keyboard
 * focus (touch has no real hover, and focus-parity is a real accessibility
 * requirement, not just a nice-to-have). Both variants close on: clicking
 * the trigger again, clicking anywhere outside, or Escape.
 *
 * The panel itself is portaled to document.body rather than rendered as a
 * DOM child here. Anchored in place, it would sit inside the claims table's
 * scroll region — and that region's overflow-x: auto implicitly computes
 * overflow-y as auto too (a real CSS rule, not a bug in this codebase), so
 * a short table (few rows) clips the bottom of the popover instead of
 * letting it float above the page. Portaling escapes that ancestor
 * entirely; position is tracked in state and recomputed on open/scroll/resize.
 */
export default function Popover({ trigger, children, content, align = 'left', label }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCoords(
        align === 'right'
          ? { top: rect.bottom + 8, right: window.innerWidth - rect.right }
          : { top: rect.bottom + 8, left: rect.left },
      );
    }
    updatePosition();

    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    // capture: true — 'scroll' doesn't bubble, so this is the only way to
    // catch scrolling on an inner ancestor (the table's own scrollbar), not
    // just the window itself.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, align]);

  const hoverHandlers =
    trigger === 'hover'
      ? {
          onMouseEnter: () => setOpen(true),
          onMouseLeave: () => setOpen(false),
          onFocus: () => setOpen(true),
          onBlur: () => setOpen(false),
        }
      : {};

  return (
    <div ref={rootRef} className={styles.root} {...hoverHandlers}>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={label}
        className={styles.trigger}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        {children}
      </span>
      {open &&
        coords &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            style={{ top: coords.top, left: coords.left, right: coords.right }}
            // Once portaled, the panel is no longer a DOM descendant of
            // .root, so moving the mouse down into it would otherwise fire
            // .root's onMouseLeave and close it immediately — these two
            // handlers restore the same "one hoverable zone" behavior the
            // un-portaled version got for free.
            onMouseEnter={trigger === 'hover' ? () => setOpen(true) : undefined}
            onMouseLeave={trigger === 'hover' ? () => setOpen(false) : undefined}
          >
            {content}
          </div>,
          document.body,
        )}
    </div>
  );
}
