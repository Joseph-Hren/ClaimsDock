// @vitest-environment jsdom
//
// Real jsdom localStorage, not a hand-rolled fake — consistent with this
// project's preference for testing the real thing (real retrieval in
// Phase 4, real API calls in 5/6) over stand-ins, even though localStorage
// only exists in a browser-like environment.

import { describe, it, expect, beforeEach } from 'vitest';
import { loadAuditLog, appendAuditEntry, getAuditLogForClaim, clearAuditLog } from './local-store';
import type { AuditLogEntry } from '../humangate/types';

function fixtureEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    claim_id: 'TEST-01',
    timestamp: '2026-07-28T12:00:00.000Z',
    actor: 'Adjuster',
    action: 'approve',
    from_status: 'Needs Approval',
    to_status: 'Resolved',
    ...overrides,
  };
}

describe('local-store (real jsdom localStorage)', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('returns an empty log when nothing has been written', () => {
    expect(loadAuditLog()).toEqual([]);
  });

  it('persists an appended entry across separate reads', () => {
    appendAuditEntry(fixtureEntry());
    expect(loadAuditLog()).toEqual([fixtureEntry()]);
  });

  it('appends rather than overwrites', () => {
    appendAuditEntry(fixtureEntry({ claim_id: 'A' }));
    appendAuditEntry(fixtureEntry({ claim_id: 'B' }));
    expect(loadAuditLog()).toHaveLength(2);
  });

  it('filters by claim_id', () => {
    appendAuditEntry(fixtureEntry({ claim_id: 'A', action: 'escalate', to_status: 'Escalated' }));
    appendAuditEntry(fixtureEntry({ claim_id: 'B' }));
    appendAuditEntry(fixtureEntry({ claim_id: 'A', action: 'deny', to_status: 'Denied' }));

    const forA = getAuditLogForClaim('A');
    expect(forA).toHaveLength(2);
    expect(forA.map((e) => e.action)).toEqual(['escalate', 'deny']);
  });

  it('actually survives as real localStorage, not an in-memory fake', () => {
    appendAuditEntry(fixtureEntry());
    // Read the raw browser API directly — proves this is really localStorage,
    // not a mock standing in for it.
    const raw = window.localStorage.getItem('claimsdock:audit-log');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(1);
  });
});
