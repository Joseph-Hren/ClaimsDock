// The Human Gate — project-spec.txt Section 4. The five real actions an
// adjuster can take on a claim. Nothing here ever finalizes itself; every
// one of these represents an explicit human decision (Section 1's
// Clarification on action execution).

import type { ClaimStatus } from '../rules/status';

export type HumanActionType = 'approve' | 'approve_with_edit' | 'escalate' | 'deny' | 'request_additional_info';

// Deny's four-part structured justification — mirrors a real denial/EOB
// letter's required elements. All four are required, non-blank strings —
// the two "if any" fields (internal rule/standard, reversal criteria) still
// take an explicit "None" rather than being omitted, since the overlay's own
// per-field validation ("This field may not be left blank") never lets any
// of the four reach here empty. Replaces a single free-text string so the
// guardrail justification-quality check (Section 4a) can evaluate and
// suggest a replacement per field instead of one undifferentiated blob.
export interface DenialJustification {
  specificReason: string;
  planPolicyProvision: string;
  internalRuleOrStandard: string;
  reversalCriteria: string;
}

export interface HumanActionInput {
  claimId: string;
  action: HumanActionType;
  /** Required for deny — the four-part structured justification. Not used for any other action. */
  denialJustification?: DenialJustification;
  /** Free-text note: optional for approve/escalate, the override note for approve_with_edit, required for request_additional_info (matches the overlay's own blank-validated field — you have to say what's missing). Never subject to any guardrail justification-quality check (that model call was cut 2026-08-02 for every action but Deny, which runs against denialJustification below instead) — validated for presence only where required, same as a post-terminal action's note (Section 4b). */
  note?: string;
  /** Only meaningful for approve_with_edit — the adjuster's overridden coverage amount, replacing the calculated one. */
  overrideAmount?: number;
}

// The four status-changing decisions that can be reversed. Each reverts a
// claim to whatever from_status was on the most recent matching entry —
// there's no fixed target the way the five HumanActionTypes have, since
// where a claim "returns to" depends on its own history. undo_recoupment
// added 2026-08-06 — Approve is still intentionally not reversible (real
// legal hurdles), but Recoupment Requested itself turns out not to carry
// that same finality: reversing a *request* to claw back a payment, before
// the actual clawback happens, isn't the same legal act as reversing the
// clawback itself. Its own note is optional, unlike the other three (see
// ActionConfirmOverlay's PostTerminalMeta).
export type UndoAction = 'undo_request_additional_info' | 'undo_escalate' | 'undo_deny' | 'undo_recoupment';

export type PostTerminalAction = UndoAction | 'request_recoupment';

export interface PostTerminalActionInput {
  claimId: string;
  action: PostTerminalAction;
  /** Required for every post-terminal action except undo_recoupment (whose
   *  own note is optional) — validated for non-blank only where required;
   *  no guardrail/LLM quality check, unlike Deny's justification. */
  note?: string;
}

export interface AuditLogEntry {
  claim_id: string;
  timestamp: string; // ISO 8601
  actor: 'Adjuster' | 'System';
  // 'note' — a free-form entry the adjuster adds without taking an action;
  // from_status and to_status are both the claim's current status (no real
  // transition), and the note text is carried in `reason`. PostTerminalAction
  // entries (the three undos + request_recoupment) are real transitions and
  // always carry their required note in `reason` too.
  action: HumanActionType | 'auto_approve' | 'note' | PostTerminalAction;
  from_status: ClaimStatus;
  to_status: ClaimStatus;
  /** Free-form note text, the note for approve/escalate/request_additional_info/approve_with_edit, or a PostTerminalAction's required note. Unused for deny — see denialDetail. */
  reason?: string;
  /** Populated only when action === 'deny'. */
  denialDetail?: DenialJustification;
}
