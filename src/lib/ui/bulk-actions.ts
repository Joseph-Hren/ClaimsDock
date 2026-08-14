// Bulk-actions-bar logic — what the bar shows for a given multi-select, kept
// separate from ClaimsCard's own single-claim action logic (some overlap in
// the underlying recommendation/status mapping, kept as two small copies
// rather than a shared abstraction neither side fully needs the same shape
// of). A button only ever appears when EVERY selected claim already agrees
// on the same recommendation or status — by construction, this means the
// deterministic recommendation-mismatch check can never fire for a bulk
// action, so there's no separate bulk-mismatch warning to build.

import type { DashboardClaimRow } from './dashboard-rows';
import type { RecommendedAction } from '../rules/action-lookup';
import type { ClaimStatus } from '../rules/status';
import type { UndoAction } from '../humangate/types';

type RecommendationBucket = 'approve' | 'escalate' | 'request_additional_info' | 'deny';

function recommendationBucket(action: RecommendedAction): RecommendationBucket {
  if (action === 'Escalate') return 'escalate';
  if (action === 'Request Additional Info') return 'request_additional_info';
  if (action === 'Deny') return 'deny';
  return 'approve';
}

const REVERSIBLE_STATUSES: Record<string, UndoAction> = {
  Denied: 'undo_deny',
  Escalated: 'undo_escalate',
  'Additional Info Requested': 'undo_request_additional_info',
};

// Per-row bucket used to test whether a whole selection is homogeneous.
// 'resolved' and 'deny' are real, named buckets (not folded into a generic
// "none") specifically so the two "nothing available" messages can tell a
// genuinely mixed selection apart from a homogeneous one that just has no
// bulk action defined for it.
type RowBucket =
  | { kind: 'approve' | 'escalate' | 'request_additional_info' }
  | { kind: 'reverse'; status: ClaimStatus }
  | { kind: 'cancel_recoupment' }
  | { kind: 'deny' }
  | { kind: 'resolved' };

function bucketForRow(row: DashboardClaimRow): RowBucket {
  if (row.status === 'Recoupment Requested') return { kind: 'cancel_recoupment' };
  if (row.status in REVERSIBLE_STATUSES) return { kind: 'reverse', status: row.status };
  if (row.status === 'Resolved') return { kind: 'resolved' };
  const bucket = recommendationBucket(row.recommendedAction);
  if (bucket === 'deny') return { kind: 'deny' };
  return { kind: bucket };
}

// One queued step — the sequential actions (Approve, Escalate, Request
// Additional Info, any Reverse) resolve to a list of these; Dashboard opens
// each claim's own existing overlay in turn via its normal modal machinery,
// which is what actually gives the adjuster a chance to add an optional
// note before each one commits. Approve/Escalate moved into this queue
// 2026-08-14 — they used to be 'instant' (see below), which skipped that
// overlay/note step entirely; found live as a real bug, not a preference.
export interface QueueStep {
  claimId: string;
  action: 'approve' | 'escalate' | 'request_additional_info' | UndoAction;
}

export type BulkBarState =
  | { kind: 'instant'; label: string; action: 'undo_recoupment' }
  | { kind: 'queue'; label: string; steps: QueueStep[] }
  | { kind: 'none'; message: string };

const REVERSE_LABEL: Record<string, string> = {
  Denied: 'Reverse denial decision',
  Escalated: 'Reverse escalation',
  'Additional Info Requested': 'Reverse additional info request',
};

export function computeBulkBarState(rows: DashboardClaimRow[]): BulkBarState {
  const n = rows.length;
  // Dashboard computes this unconditionally on every render (the bar itself
  // only mounts once something's selected, but the value is still needed as
  // a prop before that) — an empty selection is the default state on every
  // page load, not an edge case, and crashed the whole page until fixed.
  if (n === 0) {
    return { kind: 'none', message: 'No bulk actions are available for the selected claims.' };
  }
  const buckets = rows.map(bucketForRow);
  const kinds = new Set(buckets.map((b) => b.kind));

  if (kinds.size > 1) {
    return { kind: 'none', message: 'Selected claims have different recommended actions: act on them individually.' };
  }

  const only = buckets[0];
  if (only.kind === 'approve') {
    return {
      kind: 'queue',
      label: `Approve ${n} claim${n === 1 ? '' : 's'}`,
      steps: rows.map((r) => ({ claimId: r.claim.claim_id, action: 'approve' as const })),
    };
  }
  if (only.kind === 'escalate') {
    return {
      kind: 'queue',
      label: `Escalate ${n} claim${n === 1 ? '' : 's'}`,
      steps: rows.map((r) => ({ claimId: r.claim.claim_id, action: 'escalate' as const })),
    };
  }
  if (only.kind === 'cancel_recoupment') {
    return { kind: 'instant', label: `Cancel recoupment request for ${n} claim${n === 1 ? '' : 's'}`, action: 'undo_recoupment' };
  }
  if (only.kind === 'deny' || only.kind === 'resolved') {
    return { kind: 'none', message: 'No bulk actions are available for the selected claims.' };
  }
  if (only.kind === 'request_additional_info') {
    return {
      kind: 'queue',
      label: `Request additional info for ${n} claim${n === 1 ? '' : 's'}`,
      steps: rows.map((r) => ({ claimId: r.claim.claim_id, action: 'request_additional_info' as const })),
    };
  }
  // 'reverse' — one or more of Denied/Escalated/Additional Info Requested,
  // possibly mixed together; each claim still reverses via its own specific
  // undo action, but the label reflects whether the group is homogeneous.
  const distinctStatuses = new Set(buckets.map((b) => (b.kind === 'reverse' ? b.status : '')));
  const label =
    distinctStatuses.size === 1
      ? `${REVERSE_LABEL[[...distinctStatuses][0]]} for ${n} claim${n === 1 ? '' : 's'}`
      : `Reverse decisions for ${n} claim${n === 1 ? '' : 's'}`;
  return {
    kind: 'queue',
    label,
    steps: rows.map((r) => ({ claimId: r.claim.claim_id, action: REVERSIBLE_STATUSES[r.status] })),
  };
}
