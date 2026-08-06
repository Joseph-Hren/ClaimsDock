// Call 2 of the Evaluation Pipeline (project-spec.txt Section 1 & 3): the
// isolated confidence judge, plus recommendation drafting folded into the
// same call (see Section 1's implementation note on why). Shown only Call
// 1's evidence and proposed category — never Call 1's reasoning, never the
// raw claim JSON again — so it can't rubber-stamp its own prior read; it has
// to independently judge how well the evidence supports the stated category.

import { PIPELINE_EFFORT } from './client';
import { callModel, type ModelProvider } from './model-client';
import { getFullCorpusContext } from './context';
import { withCompletenessRetry } from './batch-retry';
import type { Category, ConfidenceTier } from '../rules/action-lookup';
import type { ClaimNumberRegistry } from '../claims/claim-number';

export interface ConfidenceInput {
  claim_id: string;
  category: Category;
  category_detail: string;
  evidence: string[];
}

export interface ConfidenceResult {
  claim_id: string;
  /** Null only for complex-math, which never receives a tier — Section 7c. */
  confidence_tier: ConfidenceTier | null;
  recommendation_narrative: string;
}

const TIER_VALUES = ['High Confidence', 'Confident', 'Suspected', 'Uncertain', 'N/A'] as const;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim_id: { type: 'string' },
          confidence_tier: {
            type: 'string',
            enum: TIER_VALUES,
            description:
              'Must be exactly "N/A" for complex-math claims (a calculation, not a judgment call — never gets a tier). One of the four real tiers for every other category, including clean.',
          },
          recommendation_narrative: {
            type: 'string',
            description:
              '1-3 sentences, plain language, citing the specific evidence and (where relevant) the specific policy line that supports it. This text is shown to the adjuster and may also be cited verbatim in a later guardrail confirmation, so it must stand alone without needing Call 1\'s internal reasoning to make sense.',
          },
        },
        required: ['claim_id', 'confidence_tier', 'recommendation_narrative'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
} as const;

// Rephrased 2026-07-31 (Pass A0 live-reliability investigation) — heavier
// structural scaffolding (markdown headers, an explicit "set" framing, and
// repeated counts) tried as a hypothesis for why this call specifically
// (never Call 1) was losing track partway through a 20-item batch. Count
// is parameterized (was hardcoded "20" in the first draft), since this same
// prompt also serves a single-claim recheck (reanalyze.ts) and will need to
// serve a much larger batch once Phase 11 Pass C/D lands.
function buildSystemPrompt(findingCount: number): string {
  return `# OVERVIEW

You are the Confidence Judge of a medical-claims adjudication pipeline. You are shown ONLY another step's evidence and proposed category for each claim — never its reasoning, never the original claim document. Your job is to independently judge how directly that evidence supports the stated category, then draft a short recommendation. You will make one JUDGEMENT and one RECOMMENDATION per claim finding. There will be ${findingCount} claim findings. You will make a total of ${findingCount} total JUDGEMENT results and ${findingCount} total RECOMMENDATION results, one per claim finding.

## SUMMARY

You will be given instructions on how to judge and how to make a recommendation for each of ${findingCount} findings. After the instructions, you will be given a FINDINGS array of ${findingCount} medical claim findings to make a JUDGEMENT for *AND* to make a RECOMMENDATION for, individually. You MUST make a single judgement and a single recommendation for all ${findingCount} findings (${findingCount} judgements matched with ${findingCount} recommendations, one judgement and one recommendation for each of the ${findingCount} findings).

## START OF INSTRUCTIONS

### INSTRUCTIONS FOR CONFIDENCE RATINGS

Confidence rubric (project-spec.txt Section 3) — this measures evidential support for the conclusion reached, not a bare probability:
- High Confidence: two or more independent signals converge on the same conclusion.
- Confident: one clear, direct match — no corroborating second signal, but nothing contradicts it either.
- Suspected: a partial or ambiguous pattern match — plausible, not clean.
- Uncertain: a stretch inference, minimal supporting evidence, or contradictory signals present.
- N/A: complex-math ONLY. This is a calculation, not a judgment call, so it never receives a tier — use this exact value and nothing else for that category.

This rubric applies to every category, including a "clean" read: a clean finding can itself be well-supported (multiple corroborating signals) or weakly supported (a single data point merely consistent with clean rather than confirming it) — judge it the same way you'd judge a positive finding.

### INSTRUCTIONS FOR RECOMMENDATIONS

recommendation_narrative: plain language, grounded in the evidence you were given and, where relevant, a specific line from the reference material below. Do not draft or imply a final action (approve/deny/escalate) — a separate, deterministic step maps category and confidence to the recommended action. Just explain, in a sentence or two, what was found and how confident that finding is.

Reference material (Coverage & Adjudication Policy, Fraud-Indicator Reference, Regulatory Deadline Reference):
${getFullCorpusContext()}`;
}

type RawConfidenceResult = {
  claim_id: string;
  confidence_tier: (typeof TIER_VALUES)[number];
  recommendation_narrative: string;
};

export async function runConfidence(
  inputs: ConfidenceInput[],
  registry: ClaimNumberRegistry,
  provider: ModelProvider = 'anthropic',
): Promise<ConfidenceResult[]> {
  // Same rule as Call 1 (see format-claim.ts): the model only ever sees/
  // returns the opaque display number, never the real claim_id.
  const claimBlocks = inputs
    .map(
      (i) =>
        `<finding claim_id="${registry.toDisplay(i.claim_id)}" proposed_category="${i.category}" category_detail="${i.category_detail}">\nEvidence:\n${i.evidence.map((e) => `- ${e}`).join('\n')}\n</finding>`,
    )
    .join('\n\n');
  const displayIds = inputs.map((i) => registry.toDisplay(i.claim_id));
  const n = displayIds.length;

  const raw = await withCompletenessRetry({
    label: 'runConfidence',
    expectedIds: displayIds,
    getId: (r: RawConfidenceResult) => r.claim_id,
    attempt: async () => {
      // Bumped from 8000 to 16000 at Pass A0 (see analysis.ts's identical
      // comment) — then measured for real at Pass G (2026-08-06): a live
      // 20-claim run used only 3,111 of that 16,000, ~19%. Set to 7,000
      // instead — better than 2x margin over the real number, without the
      // extra reserved-but-unused headroom a larger round number would
      // still book against Kimi's own rate-limit accounting, which counts
      // the requested max_completion_tokens against quota regardless of
      // what's actually generated (confirmed against the live account,
      // 2026-08-06).
      const text = await callModel({
        provider,
        // Bumped 7000 -> 7400 (2026-08-06), same reasoning as analysis.ts's Call 1 bump: the 132-claim expansion's
        // slightly larger chunk size (20 -> 22), proactive rather than freshly measured.
        maxTokens: 7400,
        effort: PIPELINE_EFFORT,
        schemaName: 'claim_confidence',
        schema: RESULT_SCHEMA,
        system: buildSystemPrompt(n),
        userMessage: `### FURTHER INSTRUCTIONS\n\nMake one JUDGEMENT for every one of the ${n} findings below, in the FINDINGS array.\nMake one RECOMMENDATION for every one of the ${n} findings in the FINDINGS array.\nYour results array MUST contain exactly ${n} entries: ${n} JUDGEMENTS and RECOMMENDATIONS. One set (a set contains one JUDGEMENT and one RECOMMENDATION) per claim finding.\n\none JUDGEMENT per claim_id, and one RECOMMENDATION per claim_id, covering all of: ${displayIds.join(', ')}.\n\n# START OF FINDINGS ARRAY\n\n${claimBlocks}`,
      });

      const parsed = JSON.parse(text) as { results: RawConfidenceResult[] };
      return parsed.results;
    },
  });

  return raw.map((r) => ({
    claim_id: registry.toClaimId(r.claim_id) ?? r.claim_id,
    confidence_tier: r.confidence_tier === 'N/A' ? null : r.confidence_tier,
    recommendation_narrative: r.recommendation_narrative,
  }));
}
