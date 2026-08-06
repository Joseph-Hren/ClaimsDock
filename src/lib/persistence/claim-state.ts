// The claim state a UI would actually render — merges the shared,
// per-ISO-week Pipeline output (pipeline/cache.ts) with whatever this
// browser's own localStorage says a human has since done to the claim
// (Section 1/11's two-tier persistence model). A claim's current status is
// simply its latest audit entry's to_status; if there's no audit entry yet,
// the Pipeline's own output — including its own auto-approval — is
// authoritative.

import type { GeneratedClaim } from '../claims/types';
import type { PipelineClaimResult } from '../pipeline/orchestrator';
import type { AuditLogEntry } from '../humangate/types';
import type { ClaimStatus } from '../rules/status';
import { resolveSeverity, type SeverityBand } from '../rules/severity';
import { computeSlaStatus } from '../rules/sla';
import { temporaryHeldSince } from '../rules/temporary-hold';
import { getAuditLogForClaim } from './local-store';

export interface CurrentClaimState {
  status: ClaimStatus;
  severity: SeverityBand;
  auditLog: AuditLogEntry[];
}

export function getCurrentClaimState(
  claim: GeneratedClaim,
  pipelineResult: PipelineClaimResult,
  now: Date = new Date(),
): CurrentClaimState {
  const auditLog = getAuditLogForClaim(claim.claim_id);

  if (auditLog.length === 0) {
    return { status: pipelineResult.status, severity: pipelineResult.severity, auditLog };
  }

  const latest = auditLog[auditLog.length - 1];
  const heldSince = temporaryHeldSince(claim, new Date(claim.submitted_date));
  const sla = computeSlaStatus({ slaTier: claim.sla_tier, submittedDate: claim.submitted_date, now, heldSince });
  const severity = resolveSeverity({
    status: latest.to_status,
    billedAmount: claim.total_charge,
    disputedMedicalNecessity: pipelineResult.disputed_medical_necessity,
    slaPercentRemaining: sla.percentRemaining,
  });

  return { status: latest.to_status, severity, auditLog };
}
