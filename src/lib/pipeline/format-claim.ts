// Renders one claim (plus whatever context Call 1 needs to reason about it)
// into a prompt block. Strips _testMeta entirely — that's authoring metadata
// recording which scenario a seed claim was built to exercise, i.e. the
// answer key, and must never reach the model. Also redacts claim_id (and any
// linked_claim_id) to the opaque display number via the shared registry —
// the real internal claim_id encodes the authored scenario directly in its
// own text (see project-spec.txt Section 7d) and must never reach the model
// either, for the same reason _testMeta doesn't.

import type { Claim, GeneratedClaim } from '../claims/types';
import type { ProviderHistoryEntry } from '../claims/types';
import type { ClaimNumberRegistry } from '../claims/claim-number';
import { detectMissingFields } from '../rules/missing-fields';
import { getMemberBenefitStatus } from '../rules/coverage-lookup';

function billingProviderNpi(claim: Claim): string | null {
  return claim.form_type === 'CMS-1500' ? claim.box33_billing_provider.npi : claim.billing_provider_npi;
}

function redactClaimForPrompt(claim: Claim, registry: ClaimNumberRegistry): unknown {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it
  const { _testMeta, ...rest } = claim;
  return {
    ...rest,
    claim_id: registry.toDisplay(claim.claim_id),
    linked_claim_id: claim.linked_claim_id ? registry.toDisplay(claim.linked_claim_id) : claim.linked_claim_id,
  };
}

export function formatClaimForPrompt(
  claim: GeneratedClaim,
  allClaims: GeneratedClaim[],
  providerHistory: ProviderHistoryEntry[],
  registry: ClaimNumberRegistry,
): string {
  const parts: string[] = [];

  parts.push(`<claim id="${registry.toDisplay(claim.claim_id)}">`);
  parts.push(JSON.stringify(redactClaimForPrompt(claim, registry), null, 2));

  if (claim.linked_claim_id) {
    const linked = allClaims.find((c) => c.claim_id === claim.linked_claim_id);
    if (linked) {
      parts.push(
        `<linked_claim id="${registry.toDisplay(linked.claim_id)}" reason="same encounter, different billing entity — compare for consistency">`,
      );
      parts.push(JSON.stringify(redactClaimForPrompt(linked, registry), null, 2));
      parts.push('</linked_claim>');
    }
  }

  const npi = billingProviderNpi(claim);
  const history = npi ? providerHistory.find((p) => p.provider_npi === npi) : undefined;
  if (history) {
    parts.push(
      `<billing_provider_history provider_npi="${npi}">This provider's trailing-6-month average is ${history.trailing_6mo_avg_monthly_claims} claims/month; this month's count is ${history.current_month_claims}. ${history.note}</billing_provider_history>`,
    );
  }

  // Unconditional, every claim — the same raw facts a human adjuster would
  // always have on hand (a member-eligibility panel, a network-status
  // lookup; see coverage-lookup.ts), never on the claim form itself. Always
  // present regardless of category, deliberately: including this only for
  // claims where it happens to matter would itself be a signal, the same
  // class of leak Pass A0 already closed for claim_id. The annual inpatient
  // day count is a raw fact too, not a conclusion — this claim's own day
  // count (line units) is available on the claim already, so whether it
  // crosses the cap is something to work out, not something stated here.
  const benefitStatus = getMemberBenefitStatus(claim);
  parts.push(
    `<member_benefit_status>This member's remaining deductible balance at the start of this claim is $${benefitStatus.deductibleRemaining.toFixed(2)}. This billing provider is ${benefitStatus.isInNetwork ? 'in-network' : 'out-of-network'}. This member has used ${benefitStatus.inpatientDaysUsedThisPlanYear} of their ${benefitStatus.annualInpatientDayCap} annual inpatient benefit days prior to this claim.</member_benefit_status>`,
  );

  const missingFields = detectMissingFields(claim);
  if (missingFields.length > 0) {
    const fieldList = missingFields.map((f) => `${f.field} (${f.material ? 'material' : 'non-material'})`).join(', ');
    parts.push(
      `<known_missing_fields>The following fields are actually null on this claim, confirmed by direct inspection, not inference: ${fieldList}.</known_missing_fields>`,
    );
  }

  parts.push('</claim>');
  return parts.join('\n');
}
