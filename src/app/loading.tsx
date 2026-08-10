// Next.js's automatic Suspense-boundary fallback file for this route
// segment. The real implementation lives in components/LoadingScreen.tsx
// (moved there 2026-08-10 once page.tsx stopped awaiting anything itself —
// see that file's header comment) — this re-export just keeps the
// convention-based filename wired up and valid, in case a future route
// segment here ever genuinely suspends again. DashboardLoader.tsx is the
// real, active "still loading" state today; it imports LoadingScreen
// directly rather than through this file.
export { default } from '../components/LoadingScreen';
