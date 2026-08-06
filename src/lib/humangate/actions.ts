// Applies a human action to a claim — project-spec.txt Section 4. Nothing
// here ever infers intent on its own; every call represents an explicit
// adjuster decision (Section 1's Clarification on action execution).
// Guardrail findings (guardrails.ts/mismatch.ts) are surfaced to the
// adjuster before this runs and never enforced here — the human-authority
// principle means submission always proceeds regardless of what the
// guardrails found.
//
// Deliberately imports nothing from guardrails.ts (server-only — getClient/
// retrieve, the latter pulling in Node's `fs`) — every function below is
// pure and client-safe, called directly from ActionConfirmOverlay. Combined
// guardrail-checking (checkGuardrails) lives in guardrails.ts itself now,
// not here, for exactly that reason (found live, 2026-08-04, as a real
// Turbopack build failure once a client component needed these functions).

import type { GeneratedClaim } from '../claims/types';
import type { PipelineClaimResult } from '../pipeline/orchestrator';
import { resolveSeverity, type SeverityBand } from '../rules/severity';
import { computeSlaStatus } from '../rules/sla';
import { temporaryHeldSince } from '../rules/temporary-hold';
import type { ClaimStatus } from '../rules/status';
import type { HumanActionInput, AuditLogEntry, HumanActionType, PostTerminalAction, PostTerminalActionInput, UndoAction } from './types';

const NEW_STATUS: Record<HumanActionType, ClaimStatus> = {
  approve: 'Resolved',
  approve_with_edit: 'Resolved',
  escalate: 'Escalated',
  deny: 'Denied',
  request_additional_info: 'Additional Info Requested',
};

export interface SubmitActionResult {
  status: ClaimStatus;
  severity: SeverityBand;
  auditEntry: AuditLogEntry;
}

export function submitHumanAction(
  claim: GeneratedClaim,
  pipelineResult: PipelineClaimResult,
  input: HumanActionInput,
  now: Date = new Date(),
): SubmitActionResult {
  if (input.action === 'request_additional_info' && !input.note?.trim()) {
    throw new Error('submitHumanAction: a note is required for Request Additional Info.');
  }

  const newStatus = NEW_STATUS[input.action];

  const heldSince = temporaryHeldSince(claim, new Date(claim.submitted_date));
  const sla = computeSlaStatus({ slaTier: claim.sla_tier, submittedDate: claim.submitted_date, now, heldSince });
  const severity = resolveSeverity({
    status: newStatus,
    billedAmount: claim.total_charge,
    disputedMedicalNecessity: pipelineResult.disputed_medical_necessity,
    slaPercentRemaining: sla.percentRemaining,
  });

  const auditEntry: AuditLogEntry = {
    claim_id: claim.claim_id,
    timestamp: now.toISOString(),
    actor: 'Adjuster',
    action: input.action,
    from_status: pipelineResult.status,
    to_status: newStatus,
    reason: input.action === 'deny' ? undefined : input.note,
    denialDetail: input.action === 'deny' ? input.denialJustification : undefined,
  };

  return { status: newStatus, severity, auditEntry };
}

/**
 * Adds a free-form audit-log entry the adjuster can attach at any time
 * without taking one of the five status-changing actions above — e.g.
 * "called the provider's billing office, awaiting written follow-up."
 * from_status and to_status are both the claim's current status since
 * nothing actually transitions; never runs a guardrail check, since no
 * decision is being made.
 */
export function addAuditNote(
  claimId: string,
  currentStatus: ClaimStatus,
  note: string,
  now: Date = new Date(),
): AuditLogEntry {
  return {
    claim_id: claimId,
    timestamp: now.toISOString(),
    actor: 'Adjuster',
    action: 'note',
    from_status: currentStatus,
    to_status: currentStatus,
    reason: note,
  };
}

// Which action each UndoAction reverses — used to find the audit entry
// being undone, so the claim returns to *that* entry's from_status rather
// than a fixed target the way the five original actions have.
// undo_recoupment's own source is request_recoupment itself (a
// PostTerminalAction, not a HumanActionType — widened 2026-08-06), since
// what it reverses is the recoupment request, not one of the original five
// actions.
const REVERSAL_SOURCE_ACTION: Record<UndoAction, HumanActionType | PostTerminalAction> = {
  undo_request_additional_info: 'request_additional_info',
  undo_escalate: 'escalate',
  undo_deny: 'deny',
  undo_recoupment: 'request_recoupment',
};

// Only undo_recoupment's own note is optional (project-spec.txt Section 4b,
// amended 2026-08-06) — every other post-terminal action still requires one.
const NOTE_REQUIRED: Record<PostTerminalAction, boolean> = {
  undo_request_additional_info: true,
  undo_escalate: true,
  undo_deny: true,
  undo_recoupment: false,
  request_recoupment: true,
};

function isUndoAction(action: PostTerminalAction): action is UndoAction {
  return action !== 'request_recoupment';
}

/**
 * Submits one of the five post-terminal actions — the four reversals (each
 * looking up its own target status from history) plus request_recoupment
 * (a fixed one-way forward transition, since Approve itself is intentionally
 * never reversible — real legal hurdles for recoupment, Section 4 addendum
 * 2026-07-30; a *request* to recoup is not the same legal act, and can be
 * reversed, per the same section amended 2026-08-06). Deliberately outside
 * submitHumanAction/checkGuardrails: none of these five run a mismatch or
 * justification-quality check — a note is required for four of the five
 * (validated for non-blank only, thrown here rather than deferred to a
 * caller, since the rule has no AI judgment to precede it) but never
 * evaluated for quality the way Deny's is.
 */
export function submitPostTerminalAction(
  claim: GeneratedClaim,
  pipelineResult: PipelineClaimResult,
  auditLog: AuditLogEntry[],
  input: PostTerminalActionInput,
  now: Date = new Date(),
): SubmitActionResult {
  if (NOTE_REQUIRED[input.action] && !input.note?.trim()) {
    throw new Error('submitPostTerminalAction: a note is required for this post-terminal action.');
  }

  const currentStatus: ClaimStatus =
    auditLog.length > 0 ? auditLog[auditLog.length - 1].to_status : pipelineResult.status;

  let newStatus: ClaimStatus;
  if (isUndoAction(input.action)) {
    const sourceAction = REVERSAL_SOURCE_ACTION[input.action];
    const reversedEntry = [...auditLog].reverse().find((entry) => entry.action === sourceAction);
    if (!reversedEntry) {
      throw new Error(`submitPostTerminalAction: no "${sourceAction}" entry found in the audit log to reverse.`);
    }
    newStatus = reversedEntry.from_status;
  } else {
    newStatus = 'Recoupment Requested';
  }

  const heldSince = temporaryHeldSince(claim, new Date(claim.submitted_date));
  const sla = computeSlaStatus({ slaTier: claim.sla_tier, submittedDate: claim.submitted_date, now, heldSince });
  const severity = resolveSeverity({
    status: newStatus,
    billedAmount: claim.total_charge,
    disputedMedicalNecessity: pipelineResult.disputed_medical_necessity,
    slaPercentRemaining: sla.percentRemaining,
  });

  const auditEntry: AuditLogEntry = {
    claim_id: claim.claim_id,
    timestamp: now.toISOString(),
    actor: 'Adjuster',
    action: input.action,
    from_status: currentStatus,
    to_status: newStatus,
    reason: input.note,
  };

  return { status: newStatus, severity, auditEntry };
}
