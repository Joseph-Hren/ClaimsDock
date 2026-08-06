// The Deny justification-quality guardrail — project-spec.txt Section
// 4a(b). A soft nudge: never blocks a human from proceeding with their
// original text, per the Core Thesis's human-gate principle.
//
// Server-only (callModel/retrieve, the latter pulling in Node's `fs` via
// rag/chunk.ts) — never import this file from a client component. The
// deterministic mismatch check used to live here too; split out to
// mismatch.ts (2026-08-04) specifically so client code needs no exposure to
// this file's server-only import graph at all. checkGuardrails() below
// (moved from actions.ts the same day, for the same reason) is the one
// place both checks are still run together — itself server-only, called
// from an app/api/ route or a Node script, never straight from a component.
//
// (b) used to be two functions — a general single-field version (covering
// Deny's old one-field justification and Approve-with-edit's override note)
// plus this Deny-specific four-field version. The general version is cut
// (2026-08-02, see Section 4a): Approve doesn't carry Deny's regulatory
// stakes, and the mismatch check already covers the accountability moment
// for free. Deny's four-field check below is now the only model call this
// file makes.
//
// Routed through model-client.ts's shared callModel() (2026-08-05) — it was
// hardcoded to the pre-Kimi-consolidation Anthropic-only client.ts instead,
// a real gap against Phase 13 Pass C's own plan (Kimi first, cost-driven,
// same reasoning as the Pipeline's Phase 12 provider choice; Claude only as
// an optional Pass D if Kimi proves insufficient) — found and fixed live
// once this pass actually got underway. Defaults to Kimi accordingly.

import type { PipelineClaimResult } from '../pipeline/orchestrator';
import type { HumanActionType, DenialJustification } from './types';
import { callModel, type ModelProvider } from '../pipeline/model-client';
import { retrieve } from '../rag/retrieve';
import { checkRecommendationMismatch, type MismatchCheckResult } from './mismatch';
import { DENY_FIELD_REQUIREMENTS } from './deny-field-requirements';
import { withChunkRetry } from '../pipeline/batch-retry';
import { FRAUD_NONPAYMENT_PROVISION } from '../rules/coverage-constants';

const FRAUD_PROVISION_HEADING = 'Fraud, Misrepresentation, and Non-Payable Claims';

const ROUTER_EFFORT = 'low' as const;

/**
 * Shared result shape for a single judged field — still used by the Deny
 * check below (each of its four fields returns one of these). The general,
 * single-field version of this check (originally also covering Approve-
 * with-edit's override note) was cut 2026-08-02: Approve doesn't carry
 * Deny's regulatory stakes (ERISA's "full and fair review" requirement
 * specifically concerns adverse determinations, not approvals), and the
 * free, deterministic mismatch check above already surfaces the
 * accountability moment for an overridden recommendation at no API cost.
 * See project-spec.txt Section 4a's own note on the cut.
 */
export interface JustificationCheckResult {
  acceptable: boolean;
  feedback: string;
  suggestedReplacement?: string;
}

export interface DenialJustificationCheckResult {
  specificReason: JustificationCheckResult;
  planPolicyProvision: JustificationCheckResult;
  internalRuleOrStandard: JustificationCheckResult;
  reversalCriteria: JustificationCheckResult;
}

const DENIAL_FIELD_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    acceptable: { type: 'boolean' },
    feedback: {
      type: 'string',
      description:
        'One or two sentences stating the concrete reason this field is or is not acceptable — never a restatement of suggested_replacement, never your own deliberation or hedging about the decision. State the verdict directly; do not think out loud on the way to it ("given the constraint," "the honest answer is," "since none exist, this means..." are all disqualifying — cut straight to the concrete finding those phrases are stalling in front of).',
    },
    suggested_replacement: {
      type: 'string',
      description:
        'The replacement text itself only, ready to drop into the field as-is — no commentary, no explanation of why it is better. Before finalizing this text, check it against the feedback you just wrote for this same field: it must not exhibit the same defect feedback just named (e.g. if feedback rejected a citation as fabricated, the replacement must not include that same citation; if feedback rejected relying on a specific person\'s credentials to cure a theory, the replacement must not still rely on them). A replacement that repeats its own feedback\'s stated defect is worse than no replacement at all.',
    },
  },
  required: ['acceptable', 'feedback', 'suggested_replacement'],
  additionalProperties: false,
} as const;

const DENIAL_JUSTIFICATION_SCHEMA = {
  type: 'object',
  properties: {
    specific_reason: DENIAL_FIELD_RESULT_SCHEMA,
    plan_policy_provision: DENIAL_FIELD_RESULT_SCHEMA,
    internal_rule_or_standard: DENIAL_FIELD_RESULT_SCHEMA,
    reversal_criteria: DENIAL_FIELD_RESULT_SCHEMA,
  },
  required: ['specific_reason', 'plan_policy_provision', 'internal_rule_or_standard', 'reversal_criteria'],
  additionalProperties: false,
} as const;

const DENIAL_SYSTEM_PROMPT = `Your job is to judge whether each field of an adjuster's four-part denial justification is substantive, accurate to the claim's own evidence, and regulation-appropriate — and, if the entered text doesn't satisfy that criteria, to make appropriate suggestions that will satisfy the reasons for denial, based on the claim data and grounded in the reference material. This never extends to judging whether denying the claim was the right decision to make — the adjuster's chosen action always stands regardless of your judgment here.

You are shown the claim's category, evidence, and confidence, plus relevant passages from the coverage-policy and fraud-indicator reference documents. That category label (e.g. "Phantom billing or upcoding") is the Pipeline's own preliminary finding about the claim, background context only — it is NOT the adjuster's own text and is not itself subject to field 1's single-theory requirement. Judge field 1 ONLY against what the adjuster actually wrote in the "Specific reason(s) for denial" field below, never against how the category label happens to be phrased — a category label naming multiple possibilities does not mean the adjuster's own field 1 text hedges, and a hedge in field 1's own writing is only real if field 1's own writing actually hedges. Evaluate all four fields independently — the acceptability of any one field must never depend on whether the other three are acceptable; grade each field solely against whether its own content is true and satisfies its own requirement:
${DENY_FIELD_REQUIREMENTS}

### Categories
- Clean: A clean claim has no fraudulent pattern, as outlined in the reference material. It has all required data fields present, and its billing math adds up unambiguously.
- Fraud: The claim has one or more of: phantom billing, upcoding, unbundling, double billing, unnecessary/substandard care, or a documented provider volume spike. Ground this against the Fraud-Indicator Reference document below.

### What counts as substantive
A field is substantive only if it is both specific to this claim and actually correct — a true-but-irrelevant fact (the submission date, a benign dollar figure) or a real-but-inapplicable policy citation does not satisfy the field, even though it isn't empty or flippant. You are not judging whether denying the claim was the right call, only whether each field's own content genuinely does the job it claims to do, grounded in this claim's evidence and the retrieved passages.

A field that honestly states "none applies" (fields 3 or 4) is judged only against whether that's actually true of this claim, per its evidence — never against whether the claim should have been denied at all, or whether the other three fields hold up. If a claim's evidence doesn't reference any internal rule or clinical protocol, "None" is correct regardless of how weak the rest of the denial is.

Reject genuinely empty, flippant, unrelated, or unsupported text (e.g. "no", "because", "eat my shorts"), and — per each field's own requirement above — reject a fabricated citation, a real-but-inapplicable one, or (field 4) reversal criteria that don't actually match the fraud theory named in field 1. When rejecting, draft a specific replacement that actually satisfies that field's own requirement as described above, grounded only in the evidence and retrieved passages you were actually given — never invent a citation to make the replacement sound more complete than the retrieved material supports.`;

const BLANK_FIELD_RESULT: JustificationCheckResult = {
  acceptable: false,
  feedback: 'This field cannot be left blank.',
};

/**
 * Denial-specific justification-quality check — one batched model call
 * evaluating all four DenialJustification fields at once (not four separate
 * calls), so suggestions can be scoped to the exact field they replace
 * rather than one undifferentiated blob of text.
 */
export async function checkDenialJustificationQuality(
  pipelineResult: PipelineClaimResult,
  justification: DenialJustification,
  provider: ModelProvider = 'kimi',
): Promise<DenialJustificationCheckResult> {
  // The real Deny overlay's own per-field validation never lets a blank
  // field reach here — this is a defensive, zero-cost short-circuit for the
  // degenerate case (nothing to judge) rather than a substitute for that
  // validation. A field that's blank while its siblings have content still
  // goes to the model below, whose own instructions reject empty text.
  if (
    !justification.specificReason.trim() &&
    !justification.planPolicyProvision.trim() &&
    !justification.internalRuleOrStandard.trim() &&
    !justification.reversalCriteria.trim()
  ) {
    return {
      specificReason: BLANK_FIELD_RESULT,
      planPolicyProvision: BLANK_FIELD_RESULT,
      internalRuleOrStandard: BLANK_FIELD_RESULT,
      reversalCriteria: BLANK_FIELD_RESULT,
    };
  }

  const retrieved = await retrieve(`${pipelineResult.category_detail} ${pipelineResult.evidence.join(' ')}`);
  let corpusContext = retrieved.map((r) => `<passage source="${r.corpusTitle}" heading="${r.heading}">${r.text}</passage>`).join('\n\n');

  // Guaranteed, not left to retrieval luck. Field 2 of a fraud-category
  // denial always needs this exact provision — its relevance is a
  // deterministic fact of pipelineResult.category, unlike everything else
  // field 2 might cite. Found live 2026-08-06: a clinical, vitals-and-
  // discharge-flavored upcoding claim's auto-built query (category_detail +
  // evidence) didn't embed close enough to this passage to make the
  // semantic top-k, even though it made rank 2 for two other fraud claims
  // the same day whose evidence text read more overtly fraud-flavored — the
  // same corpus content, passing or failing field 2 depending on incidental
  // evidence wording. The guardrail correctly refused to accept a fabricated
  // citation rather than hallucinate one, but a genuinely correct denial
  // shouldn't be structurally unable to pass on that basis.
  if (pipelineResult.category === 'fraud' && !retrieved.some((r) => r.heading === FRAUD_PROVISION_HEADING)) {
    corpusContext += `\n\n<passage source="Coverage & Adjudication Policy" heading="${FRAUD_PROVISION_HEADING}">${FRAUD_NONPAYMENT_PROVISION}</passage>`;
  }

  // Bumped 5000 -> 8000 (2026-08-06) after a second real live truncation,
  // then 8000 -> 16000 the same day after a THIRD: server logs confirmed
  // both withChunkRetry attempts failed truncated at 8000 on a genuinely
  // hard case (a claim requiring "no information could reverse this,"
  // fighting the model's usual bias toward finding a suggestion) — attempt
  // 1 came back with finish_reason "length" and literally zero content,
  // meaning the entire 8000-token budget was spent before any visible
  // output, not just a long-but-truncated answer. DENY_FIELD_REQUIREMENTS
  // has grown to six rounds of stacked, interacting rules by this point;
  // this is a real cost of that growth, not just a coincidence. A
  // single-claim, 4-field check is cheap even with generous headroom, so
  // there's no cost reason to run this one close to the edge the way the
  // 20-claim batch calls have to — but if this recurs even at 16000, the
  // actual fix is trimming/consolidating DENY_FIELD_REQUIREMENTS itself,
  // not another bump. Wrapped in withChunkRetry (same helper as the
  // Pipeline's own chunk calls, Phase 13 Pass G) so one truncated/malformed
  // response retries in place instead of surfacing as a dead-end 500 to the
  // adjuster after they've already waited on it once.
  const text = await withChunkRetry(
    () =>
      callModel({
        provider,
        maxTokens: 16000,
        // Tried and reverted same-day (2026-08-06): temperature: 0.1, aimed at the verdict non-determinism
        // scripts/validate-deny-guardrail.ts caught (this check reversing itself on byte-identical text across
        // separate runs). Real API response, not assumption: `400 invalid temperature: only 0.6 is allowed for this
        // model` — Kimi K2.6 pins temperature server-side and rejects any override outright. This lever isn't
        // available for this model; the residual verdict variance is something the footer disclaimer (anchor.ts)
        // and the human-always-decides architecture (guardrails.ts's own header comment) have to absorb instead.
        effort: ROUTER_EFFORT,
        schemaName: 'denial_justification_check',
        schema: DENIAL_JUSTIFICATION_SCHEMA,
        system: DENIAL_SYSTEM_PROMPT,
        userMessage: `Claim category: ${pipelineResult.category} (${pipelineResult.category_detail})\nEvidence: ${pipelineResult.evidence.join('; ')}\nConfidence: ${pipelineResult.confidence_tier ?? 'N/A'}\n\n1. Specific reason(s) for denial: "${justification.specificReason}"\n2. Plan/policy provision(s) cited: "${justification.planPolicyProvision}"\n3. Internal rule/clinical protocol/medical-necessity standard applied: "${justification.internalRuleOrStandard}"\n4. What may reverse the decision: "${justification.reversalCriteria}"\n\nRelevant reference passages:\n${corpusContext}`,
      }),
    'deny-check',
    2,
  );

  const parsed = JSON.parse(text) as Record<
    'specific_reason' | 'plan_policy_provision' | 'internal_rule_or_standard' | 'reversal_criteria',
    { acceptable: boolean; feedback: string; suggested_replacement: string }
  >;

  function toResult(field: { acceptable: boolean; feedback: string; suggested_replacement: string }): JustificationCheckResult {
    return {
      acceptable: field.acceptable,
      feedback: field.feedback,
      suggestedReplacement: field.acceptable || !field.suggested_replacement ? undefined : field.suggested_replacement,
    };
  }

  return {
    specificReason: toResult(parsed.specific_reason),
    planPolicyProvision: toResult(parsed.plan_policy_provision),
    internalRuleOrStandard: toResult(parsed.internal_rule_or_standard),
    reversalCriteria: toResult(parsed.reversal_criteria),
  };
}

export interface GuardrailFindings {
  mismatch: MismatchCheckResult;
  /** Deny's four-part structured justification, one result per field. The
   *  only justification-quality check left — Approve-with-edit's single-note
   *  version was cut 2026-08-02 (see project-spec.txt Section 4a). */
  denialJustification?: DenialJustificationCheckResult;
}

/**
 * Runs both guardrail checks ahead of submission — server-only (needs
 * checkDenialJustificationQuality's model call), called from a Node script
 * or an app/api/ route, never directly from a client component. The real
 * Deny overlay calls checkRecommendationMismatch (mismatch.ts) and
 * /api/humangate/deny-check separately instead, for exactly that reason —
 * this combined function is kept for scripts/smoke-test-humangate.ts and
 * anywhere else server-side that wants both checks in one call.
 */
export async function checkGuardrails(
  pipelineResult: PipelineClaimResult,
  input: { action: HumanActionType; denialJustification?: DenialJustification },
  provider: ModelProvider = 'kimi',
): Promise<GuardrailFindings> {
  const mismatch = checkRecommendationMismatch(pipelineResult, input.action);

  const denialJustification =
    input.action === 'deny' && input.denialJustification
      ? await checkDenialJustificationQuality(pipelineResult, input.denialJustification, provider)
      : undefined;

  return { mismatch, denialJustification };
}
