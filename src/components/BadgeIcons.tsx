// Small inline icon set shared by every badge variant. Kept as plain
// currentColor SVGs (not an icon library) since there are only eight shapes
// and each needs to inherit the badge's own text color exactly.

import { useId } from 'react';

type IconProps = { size?: number };

export function CircleDotIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
    </svg>
  );
}

// Confidence badges only — a plain filled dot, deliberately not CircleDotIcon
// (that ring+dot shape means something specific elsewhere: Status's
// "Submitted, no flags" and Severity's "Low"). Reusing it here would blur
// what it's supposed to signal in those other badges.
export function FilledDotIcon({ size = 10 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <circle cx="5" cy="5" r="5" fill="currentColor" />
    </svg>
  );
}

export function CheckIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8.2 7 10.2 11 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FlagIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 3h7l-2 2.5L11 8H4" fill="currentColor" />
    </svg>
  );
}

export function WarningTriangleIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 2.5 14 13H2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.5v3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function ExclaimCircleIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5v4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function InfoIconGlyph({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="5.2" r="0.9" fill="currentColor" />
      <path d="M8 7.4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function XBoxIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Kept only as a fallback reference — RecoupmentIcon below (the real
// assets/icon=recoupment.svg) replaced this hand-drawn approximation once
// the actual asset existed.
export function RecoupArrowIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8a5 5 0 0 1 8.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M11 2v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M13 8a5 5 0 0 1-8.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M5 14v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// Traced from assets/icon=auto-approved.svg, fill swapped for currentColor
// (the source asset hardcoded light-mode's badge-green-text) so it recolors
// correctly in dark mode too, same convention as every other badge icon.
export function AutoApprovedIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M5.14288 7.99993L7.4286 10.2856L13.7143 2.28564" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 0C9.45721 0 10.8223 0.391536 11.999 1.07227L10.6221 2.60254C9.82983 2.21696 8.94033 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.3137 14 14 11.3137 14 8C14 7.31597 13.8837 6.65932 13.6729 6.04688L15.1475 4.4082C15.6914 5.48854 16 6.70793 16 8C16 12.4183 12.4183 16 8 16C3.58172 16 0 12.4183 0 8C0 3.58172 3.58172 0 8 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Traced from assets/icon=flagged.svg (originally 14x16 — width scaled to
// match, height driven by `size` like every other badge icon).
export function FlaggedIcon({ size = 12 }: IconProps) {
  return (
    <svg width={(size * 14) / 16} height={size} viewBox="0 0 14 16" fill="none" aria-hidden="true">
      <path
        d="M14 0L11.5 5.33301L14 10.667H2V15C1.99982 15.5521 1.55218 16 1 16C0.447824 16 0.000175711 15.5521 0 15V0H14Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Traced from assets/icon=recoupment.svg (originally 17x15). The masked
// path's fill becomes currentColor; the mask itself stays white (it's a
// cutout, not a visible color).
export function RecoupmentIcon({ size = 12 }: IconProps) {
  // Multiple badges (table rows + legend) can render this icon on the same
  // page at once — a hardcoded mask id would collide across instances
  // (duplicate DOM ids), so each render gets its own via useId().
  const maskId = `recoupment-mask-${useId()}`;
  return (
    <svg width={(size * 17) / 15} height={size} viewBox="0 0 17 15" fill="none" aria-hidden="true">
      <mask id={maskId} fill="white">
        <path d="M17.01 7.42871L9.05004 14.8574V10.7178C-1.25732 10.6331 0.0539442 7.61064 0.0539442 0.000976562C2.07897 4.82576 2.07948 4.29004 8.82933 4.29004C8.90448 4.29004 8.978 4.29328 9.05004 4.29492V0L17.01 7.42871Z" />
      </mask>
      <path
        d="M17.01 7.42871L18.3746 8.89087L19.9413 7.42871L18.3746 5.96655L17.01 7.42871ZM9.05004 14.8574H7.05004V19.4596L10.4146 16.3196L9.05004 14.8574ZM9.05004 10.7178H11.05V8.73413L9.06647 8.71784L9.05004 10.7178ZM0.0539442 0.000976562L1.8981 -0.773038L-1.94606 0.000976562H0.0539442ZM8.82934 4.29004L8.82935 2.29004H8.82934V4.29004ZM9.05004 4.29492L9.00439 6.2944L11.05 6.3411V4.29492H9.05004ZM9.05004 0L10.4146 -1.46216L7.05004 -4.60219V0H9.05004ZM17.01 7.42871L15.6454 5.96655L7.68546 13.3953L9.05004 14.8574L10.4146 16.3196L18.3746 8.89087L17.01 7.42871ZM9.05004 14.8574H11.05V10.7178H9.05004H7.05004V14.8574H9.05004ZM9.05004 10.7178L9.06647 8.71784C6.54737 8.69715 4.9331 8.49358 3.89203 8.16855C2.922 7.86569 2.60266 7.50962 2.43224 7.20493C2.20062 6.79084 2.0457 6.11069 2.00932 4.81764C1.97125 3.46474 2.05394 2.07988 2.05394 0.000976562H0.0539442H-1.94606C-1.94606 1.72691 -2.02727 3.57347 -1.9891 4.93015C-1.94924 6.34669 -1.78777 7.85425 -1.05878 9.15757C-0.268596 10.5703 1.01688 11.4613 2.69993 11.9868C4.31195 12.4901 6.39902 12.6961 9.03361 12.7177L9.05004 10.7178ZM0.0539442 0.000976562L-1.79021 0.774991C-1.29964 1.9438 -0.85901 2.97264 -0.368676 3.76196C0.168412 4.62654 0.851941 5.35255 1.88336 5.79368C2.80669 6.18858 3.83343 6.27177 4.84406 6.2977C5.85242 6.32357 7.22566 6.29004 8.82934 6.29004V4.29004V2.29004C7.05808 2.29004 5.90006 2.32347 4.94664 2.29902C3.9955 2.27462 3.62995 2.19019 3.45629 2.11592C3.39072 2.08788 3.27257 2.04317 3.02909 1.65123C2.73886 1.18403 2.42004 0.47054 1.8981 -0.773038L0.0539442 0.000976562ZM8.82934 4.29004L8.82932 6.29004C8.87671 6.29004 8.87385 6.29142 9.00439 6.2944L9.05004 4.29492L9.09568 2.29544C9.08215 2.29513 8.93226 2.29004 8.82935 2.29004L8.82934 4.29004ZM9.05004 4.29492H11.05V0H9.05004H7.05004V4.29492H9.05004ZM9.05004 0L7.68546 1.46216L15.6454 8.89087L17.01 7.42871L18.3746 5.96655L10.4146 -1.46216L9.05004 0Z"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
