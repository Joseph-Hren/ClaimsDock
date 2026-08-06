'use client';

import { useEffect, useRef } from 'react';
import styles from './SettingsPanel.module.css';
import popoverStyles from './Popover.module.css';
import { SunIcon, MoonIcon, KimiIcon, ClaudeIcon } from './ChromeIcons';
import SlidingToggle, { type ToggleOption } from './SlidingToggle';
import type { ModelProvider } from '../lib/pipeline/model-client';

export type AppearanceStyle = 'ledger' | 'clinical' | 'field';
export type AppearanceTheme = 'light' | 'dark';

// Each label stays permanently in the font it names — Ledger is always
// Lora, Clinical always Karla, Field always Outfit — regardless of which
// style is currently active app-wide. Deliberately references the raw
// --font-lora/karla/outfit variables (set once on <html>, not style-scoped),
// never --font-body/--font-heading, which change meaning per active style.
const STYLE_OPTIONS: ToggleOption[] = [
  { id: 'ledger', label: 'Ledger', style: { fontFamily: 'var(--font-lora), Georgia, serif' } },
  { id: 'clinical', label: 'Clinical', style: { fontFamily: 'var(--font-karla), system-ui, sans-serif' } },
  { id: 'field', label: 'Field', style: { fontFamily: 'var(--font-outfit), system-ui, sans-serif' } },
];

const PROVIDER_OPTIONS: ToggleOption[] = [
  { id: 'kimi', label: 'Kimi', icon: <KimiIcon size={14} /> },
  { id: 'anthropic', label: 'Claude', icon: <ClaudeIcon size={14} /> },
];

const THEME_OPTIONS: ToggleOption[] = [
  { id: 'light', label: 'Light mode', icon: <SunIcon size={14} /> },
  { id: 'dark', label: 'Dark mode', icon: <MoonIcon size={14} /> },
];

interface SettingsPanelProps {
  open: boolean;
  style: AppearanceStyle;
  theme: AppearanceTheme;
  provider: ModelProvider;
  onStyleChange: (style: AppearanceStyle) => void;
  onThemeChange: (theme: AppearanceTheme) => void;
  onProviderChange: (provider: ModelProvider) => void;
  onClose: () => void;
  onOpenDiagram: () => void;
}

export default function SettingsPanel({
  open,
  style,
  theme,
  provider,
  onStyleChange,
  onThemeChange,
  onProviderChange,
  onClose,
  onOpenDiagram,
}: SettingsPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={rootRef} className={`${popoverStyles.panel} ${popoverStyles.alignRight} ${styles.panel}`}>
      <h3 className={styles.title}>Settings</h3>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Anchor&rsquo;s AI model</span>
        <SlidingToggle options={PROVIDER_OPTIONS} selected={provider} onChange={(id) => onProviderChange(id as ModelProvider)} size="small" />
        <p className={styles.modelDescription}>
          Choose which AI model Anchor uses to respond. This does not affect the pipeline that determines a claim&rsquo;s status, severity, or
          confidence rating.
        </p>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Appearance style</span>
        <SlidingToggle options={STYLE_OPTIONS} selected={style} onChange={(id) => onStyleChange(id as AppearanceStyle)} size="small" />
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Brightness mode</span>
        <SlidingToggle options={THEME_OPTIONS} selected={theme} onChange={(id) => onThemeChange(id as AppearanceTheme)} size="small" />
      </div>

      <div className={styles.howSection}>
        <h4 className={styles.howTitle}>How ClaimsDock works</h4>
        <p className={styles.howText}>
          ClaimsDock is an agentic claims-triage platform that routes adjuster questions and evaluates CMS-1500/UB-04 claims
          through a grounded RAG pipeline to detect patterns such as fraud, ambiguity, and complex coverage math — auto-approving
          clean, high-confidence claims outright while routing everything else through a human-in-the-loop approval gate.
        </p>
        <button className={styles.diagramThumb} onClick={onOpenDiagram} aria-label="Open the interactive workflow diagram">
          {/* Real screenshot of the workflow diagram, not a hand-drawn stand-in —
              deliberately kept at its native (larger-than-displayed) resolution
              so it stays legible if opened directly in a new tab and zoomed in,
              not just as this scaled-down thumbnail. */}
          <img src="/workflow-diagram.png" alt="ClaimsDock workflow diagram" className={styles.diagramThumbImg} />
        </button>
        <button className={styles.diagramLink} onClick={onOpenDiagram}>
          View the interactive workflow diagram →
        </button>
      </div>
    </div>
  );
}
