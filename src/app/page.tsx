import Dashboard from '../components/Dashboard';
import { buildDashboardRows } from '../lib/ui/dashboard-rows';

// Without this, Next.js's default static-generation behavior tries to
// prerender this page at *build* time — meaning every `next build` would
// trigger a real, live, costly Evaluation Pipeline run, with no way to know
// the in-memory per-ISO-week cache (lib/pipeline/cache.ts) makes repeated
// real requests cheap. Forcing this dynamic renders per-request instead,
// which is what actually lets that cache do its job.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const rows = await buildDashboardRows();
  return <Dashboard rows={rows} />;
}
