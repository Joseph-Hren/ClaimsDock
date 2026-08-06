import { describe, it, expect } from 'vitest';
import { computeBulkBarState } from './bulk-actions';
import type { DashboardClaimRow } from './dashboard-rows';
import type { ClaimStatus } from '../rules/status';
import type { RecommendedAction } from '../rules/action-lookup';

// Only the fields computeBulkBarState actually reads.
function fixtureRow(claimId: string, status: ClaimStatus, recommendedAction: RecommendedAction): DashboardClaimRow {
  return { claim: { claim_id: claimId }, status, recommendedAction } as DashboardClaimRow;
}

describe('computeBulkBarState', () => {
  it('does not throw for an empty selection — the default state on every page load', () => {
    expect(() => computeBulkBarState([])).not.toThrow();
    expect(computeBulkBarState([]).kind).toBe('none');
  });

  it('shows Approve when every selected claim is recommended Approve', () => {
    const rows = [fixtureRow('a', 'Submitted, no flags', 'Approve'), fixtureRow('b', 'Needs Approval', 'Approve as calculated')];
    const state = computeBulkBarState(rows);
    expect(state.kind).toBe('instant');
    expect(state.kind === 'instant' && state.action).toBe('approve');
    expect(state.kind === 'instant' && state.label).toBe('Approve 2 claims');
  });

  it('shows Escalate when every selected claim is recommended Escalate', () => {
    const rows = [fixtureRow('a', 'Submitted, flagged', 'Escalate')];
    const state = computeBulkBarState(rows);
    expect(state.kind).toBe('instant');
    expect(state.kind === 'instant' && state.action).toBe('escalate');
    expect(state.kind === 'instant' && state.label).toBe('Escalate 1 claim');
  });

  it('queues Request Additional Info for every selected claim, one step per claim', () => {
    const rows = [
      fixtureRow('a', 'Submitted, flagged', 'Request Additional Info'),
      fixtureRow('b', 'Submitted, flagged', 'Request Additional Info'),
    ];
    const state = computeBulkBarState(rows);
    expect(state.kind).toBe('queue');
    if (state.kind !== 'queue') return;
    expect(state.label).toBe('Request additional info for 2 claims');
    expect(state.steps).toEqual([
      { claimId: 'a', action: 'request_additional_info' },
      { claimId: 'b', action: 'request_additional_info' },
    ]);
  });

  it('never offers a bulk button for claims recommended Deny', () => {
    const rows = [fixtureRow('a', 'Needs Approval', 'Deny'), fixtureRow('b', 'Needs Approval', 'Deny')];
    const state = computeBulkBarState(rows);
    expect(state).toEqual({ kind: 'none', message: 'No bulk actions are available for the selected claims.' });
  });

  it('offers no bulk action for an all-Resolved selection', () => {
    const rows = [fixtureRow('a', 'Resolved', 'Approve')];
    const state = computeBulkBarState(rows);
    expect(state).toEqual({ kind: 'none', message: 'No bulk actions are available for the selected claims.' });
  });

  it('offers a specific Reverse label when all selected share the same reversible status', () => {
    const rows = [fixtureRow('a', 'Denied', 'Approve'), fixtureRow('b', 'Denied', 'Approve')];
    const state = computeBulkBarState(rows);
    expect(state.kind).toBe('queue');
    if (state.kind !== 'queue') return;
    expect(state.label).toBe('Reverse denial decision for 2 claims');
    expect(state.steps).toEqual([
      { claimId: 'a', action: 'undo_deny' },
      { claimId: 'b', action: 'undo_deny' },
    ]);
  });

  it('offers a generic Reverse label for a mix of reversible statuses, each with its own undo action', () => {
    const rows = [fixtureRow('a', 'Denied', 'Approve'), fixtureRow('b', 'Escalated', 'Approve'), fixtureRow('c', 'Additional Info Requested', 'Approve')];
    const state = computeBulkBarState(rows);
    expect(state.kind).toBe('queue');
    if (state.kind !== 'queue') return;
    expect(state.label).toBe('Reverse decisions for 3 claims');
    expect(state.steps).toEqual([
      { claimId: 'a', action: 'undo_deny' },
      { claimId: 'b', action: 'undo_escalate' },
      { claimId: 'c', action: 'undo_request_additional_info' },
    ]);
  });

  it('offers an instant Cancel Recoupment Request for an all-Recoupment-Requested selection, no note step', () => {
    const rows = [fixtureRow('a', 'Recoupment Requested', 'Approve'), fixtureRow('b', 'Recoupment Requested', 'Approve')];
    const state = computeBulkBarState(rows);
    expect(state.kind).toBe('instant');
    expect(state.kind === 'instant' && state.action).toBe('undo_recoupment');
    expect(state.kind === 'instant' && state.label).toBe('Cancel recoupment request for 2 claims');
  });

  it('shows the mixed-selection message when recommendations/statuses genuinely differ', () => {
    const rows = [fixtureRow('a', 'Submitted, no flags', 'Approve'), fixtureRow('b', 'Submitted, flagged', 'Escalate')];
    const state = computeBulkBarState(rows);
    expect(state).toEqual({
      kind: 'none',
      message: 'Selected claims have different recommended actions: act on them individually.',
    });
  });
});
