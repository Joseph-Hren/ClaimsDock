import DashboardLoader from '../components/DashboardLoader';

// Without this, Next.js's default static-generation behavior tries to
// prerender this page at *build* time. This page no longer awaits anything
// itself (progressive loading moved that wait into DashboardLoader.tsx,
// 2026-08-10 — see that file), but force-dynamic is kept regardless: a
// prerendered version of this shell would bake in whatever request-time
// values existed at build time, which is never correct for a per-request
// dashboard.
export const dynamic = 'force-dynamic';

export default function Home() {
  return <DashboardLoader />;
}
