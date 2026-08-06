import type { Metadata } from 'next';
import { Lora, Karla, Outfit, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const lora = Lora({ variable: '--font-lora', subsets: ['latin'] });
const karla = Karla({ variable: '--font-karla', subsets: ['latin'] });
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'] });
const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'ClaimsDock',
  description: 'A medical-claims adjudication copilot.',
};

// Runs before hydration so the saved style/theme applies on first paint —
// otherwise the page would flash the default (Ledger/Light) and then jump.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var style = localStorage.getItem('claimsdock:style') || 'ledger';
    var theme = localStorage.getItem('claimsdock:theme') || 'light';
    document.documentElement.setAttribute('data-style', style);
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-style="ledger"
      data-theme="light"
      // The blocking script below intentionally overwrites these two
      // attributes with the visitor's saved preference before hydration —
      // that's the whole point (no flash of the wrong theme). Telling React
      // to expect that divergence here is the documented fix, not a
      // workaround: https://react.dev/reference/react-dom/client/hydrateRoot#suppressing-unavoidable-hydration-mismatch-errors
      suppressHydrationWarning
      className={`${lora.variable} ${karla.variable} ${outfit.variable} ${ibmPlexMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
