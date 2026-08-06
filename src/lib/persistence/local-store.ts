// Client-side persistence — project-spec.txt Section 1/11: adjuster actions
// (approvals, denials, escalations, overrides, audit log entries) are
// stored per-browser via localStorage, never written back to the shared
// per-ISO-week Pipeline cache (pipeline/cache.ts). One flat, queryable
// audit log rather than one key per claim — Section 9 explicitly wants
// cross-claim queries ("show me claims approved in March"), which a single
// array supports directly; a claim's *current* status is simply its
// latest entry's to_status (see persistence/claim-state.ts), so there's no
// separate status value that could drift out of sync with the log.

import type { AuditLogEntry } from '../humangate/types';

const AUDIT_LOG_KEY = 'claimsdock:audit-log';

// Dashboard (a 'use client' component) still gets one real server-side
// render pass before hydration — Next.js's App Router doesn't skip SSR just
// because a component is client-marked. getCurrentClaimState() calls into
// this module unconditionally on every render (not just in response to a
// user action), so this guard is load-bearing, not defensive boilerplate:
// without it, that very first server render throws "localStorage is not
// defined" and the whole page fails to load (found live, 2026-08-06). A
// server render has no real per-browser history to read anyway — an empty
// log is the correct answer there, not a fallback.
const isBrowser = typeof window !== 'undefined';

export function loadAuditLog(): AuditLogEntry[] {
  if (!isBrowser) return [];
  const raw = localStorage.getItem(AUDIT_LOG_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as AuditLogEntry[];
}

export function appendAuditEntry(entry: AuditLogEntry): void {
  if (!isBrowser) return;
  const log = loadAuditLog();
  log.push(entry);
  localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
}

export function getAuditLogForClaim(claimId: string): AuditLogEntry[] {
  return loadAuditLog().filter((e) => e.claim_id === claimId);
}

/** Test/dev-only escape hatch — a real adjuster never clears their own history. */
export function clearAuditLog(): void {
  if (!isBrowser) return;
  localStorage.removeItem(AUDIT_LOG_KEY);
}
