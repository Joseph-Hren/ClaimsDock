// Call 1 of the Evaluation Pipeline (project-spec.txt Section 1): Analysis.
// One batched call across every claim — evidence and a proposed category
// only. No confidence tier, no recommendation; Call 2 (confidence.ts) does
// both of those, isolated from whatever reasoning produced this evidence.

import { PIPELINE_EFFORT } from './client';
import { callModel, type ModelProvider } from './model-client';
import { getFullCorpusContext } from './context';
import { formatClaimForPrompt } from './format-claim';
import { withCompletenessRetry } from './batch-retry';
import type { GeneratedClaim, ProviderHistoryEntry } from '../claims/types';
import type { Category } from '../rules/action-lookup';
import type { ClaimNumberRegistry } from '../claims/claim-number';

export interface AnalysisResult {
  claim_id: string;
  evidence: string[];
  proposed_category: Category;
  category_detail: string;
  disputed_medical_necessity: boolean;
}

const CATEGORY_VALUES: Category[] = ['fraud', 'ambiguous', 'missing-data', 'complex-math', 'clean'];

// category_reasoning is conditionally included per provider (see
// buildResultSchema) — kept for Claude (clear net positive: 19.0 and 18.2
// mean across two batches, essentially Claude's ceiling), tested with and
// without for Kimi specifically, since the same field looked neutral-to-
// mildly-negative there across several batches (17.4 without vs. 15.3-16.6
// with) — Kimi has no private extended-thinking phase the way Claude does,
// so this field is its *only* reasoning step rather than a summary of one
// already settled privately, and forcing an explicit justification appears
// to sometimes invite hedging away from an otherwise-clear call rather than
// reinforcing it.
function buildResultSchema(includeReasoning: boolean, capEvidenceLength: boolean) {
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            claim_id: { type: 'string' },
            evidence: {
              type: 'array',
              items: { type: 'string' },
              // A real, structural cap — not just prose — but Kimi-only.
              // A live documentation-mismatch claim produced 10 evidence
              // entries despite the description below already saying "aim
              // for 3-6" (2026-08-06); strengthening that same prose to an
              // explicit "HARD CAP of 6, never more" made it WORSE (13
              // entries, live-tested) — Kimi doesn't reliably honor a
              // numeric ceiling stated only in natural language. maxItems,
              // actually enforced by Kimi's strict JSON-schema mode, fixed
              // it cleanly on the same claim: exactly 6 dense, complete
              // bullets, no content lost, nothing cut off mid-sentence — a
              // real constraint on generation, not post-hoc truncation.
              // Confirmed NOT portable, though, before trusting it project-
              // wide: Anthropic's structured outputs reject `maxItems`
              // outright (400, "property 'maxItems' is not supported"), so
              // this is spliced in conditionally below rather than always
              // present in the schema both providers share.
              ...(capEvidenceLength ? { maxItems: 6 } : {}),
              description:
                'Short, factual bullet points only, up to 6. If a linked-claim comparison would naturally produce more than 6 individually-true facts, combine closely related ones into a single denser bullet (e.g. "this claim bills X" + "the linked claim bills Y" + "X and Y are mutually exclusive" become one bullet, not three) rather than dropping facts to fit. Each entry is one to two sentences, stating something directly observed in the claim data (a code, an amount, a diagnosis, a remark, or a direct comparison against its own linked claim). Never include your own deliberation, reconsideration, or uncertainty about the category (no "let me reconsider," "actually," "wait," "I think this is..." or similar) — that reasoning has no field to go in on this call; leave it out entirely rather than placing it here. Every entry must be about the ONE claim identified by claim_id above it — never restate or reference a finding that belongs to a different claim in this batch, except when directly comparing against its own linked claim as part of the finding itself.',
            },
            ...(includeReasoning
              ? {
                  category_reasoning: {
                    type: 'string',
                    description:
                      'A brief working-through of the category decision — apply the fraud criteria, then (if not fraud) the ambiguous/complex-math/missing-data test. Not shown to the adjuster and not a restatement of the evidence — a scratch reasoning step, 1-3 sentences.',
                  },
                }
              : {}),
            proposed_category: { type: 'string', enum: CATEGORY_VALUES },
            category_detail: {
              type: 'string',
              description:
                'A short, factual label for the specific finding within the category — e.g. the fraud sub-type, the specific ambiguity, which field is missing, or which math complexity applies. Not a justification or argument for the category.',
            },
            disputed_medical_necessity: { type: 'boolean' },
          },
          required: [
            'claim_id',
            'evidence',
            ...(includeReasoning ? ['category_reasoning'] : []),
            'proposed_category',
            'category_detail',
            'disputed_medical_necessity',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  };
}

// Rewritten 2026-08-02 (Pass E, prompt review) — Joseph's own restructure,
// markdown-sectioned in the same spirit as Call 2's proven "sets" rewrite.
// Two things deliberately NOT carried over from his draft, both discussed
// and agreed: (1) a third job, "cite the reference material to write the
// description of how and why you arrived at that category" — dropped
// entirely. It had no home in RESULT_SCHEMA (category_detail's own
// description explicitly says "not a justification or argument for the
// category"; evidence is explicitly "raw... no judgment"), and more
// importantly it would have had Call 1 start arguing for its own
// conclusion — that job already belongs to Call 2's recommendation_narrative
// specifically because Call 2 is isolated from Call 1's reasoning and has
// to independently judge it, not inherit it. (2) the final claim-count
// instruction's phrasing, tightened back to the exact "N entries, one per
// claim_id, covering all of: [list]" form already proven reliable — the
// draft's "must cover N entries for each of the following claims" reads
// ambiguously (like N-per-claim), and Call 1 has never actually had a
// completeness problem the way Call 2 once did, not worth risking one.
const REASONING_INSTRUCTION = `Before selecting proposed_category, use category_reasoning to briefly work through the decision: apply the fraud criteria first; if it's not fraud, run the ambiguous/complex-math/missing-data test below, explicitly checking whether every number needed is actually available before ruling a category in or out. Only settle on clean once you've explicitly confirmed none of the other four categories apply — don't let clean become a default when the reasoning feels uncertain. This is a working step, not a restatement of your evidence, and it isn't shown to the adjuster — keep it short.

`;

function buildSystemPrompt(includeReasoning: boolean): string {
  return `# OVERVIEW AND INSTRUCTIONS

You are the Analysis step of a medical-claims adjudication pipeline for ClaimsDock, a medical claims adjudication tool.
Your job is:
    1.    Gather evidence from each claim in the claims array below
    2.    Propose a category for each claim based on the category set below
Do NOT assign a confidence tier, and do NOT recommend an action. A separate, isolated step handles both of those from your evidence alone, so keep your evidence factual and free of hedging or confidence language ("likely," "probably," "I'm fairly sure") — state what you observed, not how sure you are about it.

${includeReasoning ? REASONING_INSTRUCTION : ''}
## CATEGORY SET

- Fraud:
The claim has one or more of: phantom billing, upcoding, unbundling, double billing, unnecessary/substandard care, or a documented provider volume spike.
Ground this against the Fraud-Indicator Reference document below.

- Ambiguous:
A genuine, unresolvable-from-the-claim-alone pattern — diagnosis/procedure plausibility, coverage applicability, coordination of benefits, responsible-party conflict, or a provider-pattern oddity that is not clearly fraud.

- Missing-data:
A required field is actually absent. If a claim has a <known_missing_fields> block, that is a confirmed, deterministic fact — use it; do not second-guess it, and do not propose a different category to explain around it.
Unlike complex-math below, a missing-data finding does NOT propagate across a linked pair — judge each linked claim only on its own <known_missing_fields> block. A missing field on one claim has no bearing on the other claim's category, even though a shared admission-level fact like day count or date (which complex-math does care about) is genuinely shared between them — a specific null field on one claim's own form is not.

- Complex-math:
A coverage calculation that is itself the notable issue about this claim; it can include:
Multiple line items or categories interacting with a threshold (a deductible or benefit-cap crossing that changes which rate applies to which part of the charge),
A day-based rather than dollar-based cap,
Multiple payers splitting a cost,
A cross-claim date check (global-surgical-period overlap).
Use the claim's own line items together with the <member_benefit_status> block within each of the individual claims data in the array of claims (remaining deductible, network status, annual inpatient benefit-day usage so far, which are not on the claim form itself) to work through the arithmetic for determining if the claim should be categorized as complex-math. Use only the sub-categories above to determine if the claim falls into this complex-math category: Multiple line-items/categories interacting with a threshold, day-based rather than dollar-based cap, multiple payers splitting a cost, or a cross-claim (2 or more claims linked for the same patient) date check.
DO NOT use this category just because a claim's remaining deductible happens to be less than its total charge — that's true of most claims with any deductible balance left and is routine, unremarkable deductible accounting, not a notable calculation; it stays clean (or whatever the rest of the claim otherwise supports) — unless the crossing itself changes the outcome in a materially interesting way, e.g. splitting one claim's lines across two different coverage rates.
If two claims are linked for the same patient (claim contains a <linked_claim> block), and one of the linked claims falls into the complex-math category because of a cross-claim date check or a day-based cap crossing, categorize both claims as complex-math — the date or day count that matters in either case is a property of the shared admission/encounter, not either claim alone. If one of the linked claims falls into the complex-math category for a different reason, categorize each claim individually on their own data from the claims array below.
If a required calculation input is genuinely missing even with the benefit-status block, use missing-data instead.

- Clean:
No material issue or issues found.
A claim that does not fall into any of the other categories listed above based on its data.
A claim categorized as clean can be well-supported or weakly-supported by evidence.
If a claim clearly falls into a category other than clean, DO NOT categorize it as clean. If it does not clearly fall into one of the other categories listed above, categorize it as clean.


## FURTHER INSTRUCTIONS ON DETERMINING CATEGORY

### Consider the following when deciding if a claim falls into the categories of Ambiguous, Missing data, or Complex-math:

Ambiguous vs. Complex-math vs Missing data:
These two share "coordination of benefits" as an example and are otherwise easy to conflate.
Before choosing between them, apply this test — can every number needed to reach a specific dollar figure be found on the claim's data fields or in the claim's <member_benefit_status> block?
- If yes: categorize the claim as complex-math, however many steps the arithmetic takes or however many parties are involved. A coordination-of-benefits split where every payer's percentage and amount is stated is complex-math, not ambiguous — knowable, just multi-step.
- If a required number is genuinely missing, even after checking the claim's <member_benefit_status> block: categorize the claim as missing-data, not complex-math.
- If the real open question is judgment — intent, policy applicability, or which of several readings is correct — rather than a missing number: ambiguous.
Complex-math never involves a judgment call, only arithmetic. If your own evidence for a complex-math claim reads like it's asking a human to decide between competing interpretations rather than just confirm a calculation, that's a sign you've actually reached an ambiguous category instead of a complex-math category — reconsider the category before finalizing; don't just note the tension.

### COMPARING LINKED CLAIM PAIRS FOR FRAUD

For linked claim pairs (claim contains a <linked_claim> block), compare the two — the sharpest fraud test in this data set is a facility/professional documentation mismatch based on the fraud criteria above that only shows up by comparing them.
DO NOT categorize a claim as fraud only because it contains a linked claim. Use the fraud criteria above to determine fraud.

### DISPUTED

disputed_medical_necessity:
True only if there's a genuine dispute about whether the billed care was medically necessary, independent of category.
Use the claim's own data to determine whether there may be a disputed medical necessity on a claim.
Look at whether the diagnosis code plausibly requires this procedure/service line, using the claim's own remarks if present.
A disputed medical necessity DOES NOT affect the category of the claim. Use the criteria in the above CATEGORIES SET to determine category, but note the disputed medical claim in your description. This will feed a deterministic severity decision in a separate, isolated step after your job is finished. It does not affect the category you are assigned to make, or confidence call made by a separate, isolated step.


## REFERENCE MATERIAL

Reference material contains: Coverage & Adjudication Policy, Fraud-Indicator Reference, Regulatory Deadline Reference

${getFullCorpusContext()}`;
}

// Originally a Kimi-only addendum (added 2026-08-02 after live testing
// showed K2.6 systematically softening two fraud sub-types toward
// clean/ambiguous — FRD-UNBUNDLE-01 and FRD-SUBSTANDARD-01 wrong in 3-4 of
// 5 runs each, a real pattern, not noise). TEMPORARILY applied to BOTH
// providers as of the next test round (2026-08-02) at Joseph's explicit
// request, specifically to get one genuinely same-prompt comparison rather
// than "tuned Kimi vs. untouched Claude" — see runAnalysis below, no longer
// branched on provider. Revert to Kimi-only (or decide otherwise) once that
// comparison's results are in. Both invented examples deliberately use
// different patients, providers, procedure codes, and diagnoses than
// anything in the real 20-claim set — reusing or lightly rewording an
// actual test claim would teach to the test rather than the general
// pattern, and would quietly invalidate the accuracy numbers gathered. A
// third, clean contrast example is included on purpose too — calibrating
// only toward "flag more fraud" risks trading one failure mode (false
// negatives) for a worse one (flagging genuinely clean claims), which a
// fraud-review tool can't afford either. Example 4 (complex-math) added the
// same day after a follow-up batch showed CPX-CMS-01 collapsing to 0/5 —
// its reasoning deliberately echoes the complex-math guardrail's own
// "materially interesting way... different coverage rates" language, so the
// example illustrates the exact boundary that guardrail draws in words
// alone, rather than adding a second, separate wording change alongside it.
const FEW_SHOT_ADDENDUM = `## EXAMPLES (for calibration only — do not confuse with the findings below)

Example 1 — Fraud (unbundling):
Claim: CPT 29870 (diagnostic knee arthroscopy) and CPT 29881 (arthroscopic knee surgery with meniscectomy) billed on the same date, same knee, same provider. Diagnosis M23.221 (derangement of medial meniscus).
Correct output: proposed_category "fraud", category_detail "unbundling — diagnostic arthroscopy billed separately from the therapeutic procedure it was part of". Reasoning: per NCCI, a diagnostic arthroscopy performed as part of the same operative session as a therapeutic arthroscopic procedure on the same joint is bundled into the therapeutic code — billing it as a separate line is the unbundling pattern, not two legitimately distinct services.

Example 2 — Fraud (unnecessary/substandard care):
Claim: Diagnosis Z00.00 (routine adult physical, no abnormal findings noted). Billed alongside CPT 93000 (ECG), CPT 71046 (chest X-ray), and CPT 80053 (comprehensive metabolic panel), with no symptoms, risk factors, or abnormal findings documented anywhere on the claim.
Correct output: proposed_category "fraud", category_detail "unnecessary care — diagnostic testing not clinically indicated by a routine, asymptomatic exam". Reasoning: a routine physical with no noted symptoms or risk factors does not support an ECG, chest X-ray, and metabolic panel — billing for medically unnecessary testing on top of a routine visit code is the unnecessary/substandard-care pattern, even though each test independently "looks real."

Example 3 — Clean (contrast — two same-day procedures that are legitimately separate, not unbundling):
Claim: Diagnosis M25.561 (pain in right knee) billed with CPT 20610 (major joint injection, knee); separately, diagnosis L60.0 (ingrown toenail) billed with CPT 11730 (removal of nail plate), same date, same visit.
Correct output: proposed_category "clean". Reasoning: two distinct procedures for two clinically unrelated conditions on the same visit are legitimately separately billable — this is routine multi-complaint billing, not unbundling. Two codes on the same date is not itself a red flag; what matters is whether they represent one procedure artificially split apart (fraud) or two genuinely distinct services (clean).

Example 4 — Complex-math (contrast — looks like routine deductible accounting, but isn't):
Claim: New-patient office visit (CPT 99204, $310) and an in-office spirometry test (CPT 94010, $90), same visit. Diagnoses: J44.0 (COPD, acute exacerbation) and M25.562 (pain, left knee, incidental). Total charge $400. Member's remaining deductible: $180. Past the deductible, the office-visit portion is covered at 80%, but the diagnostic-testing portion is covered at 100% under the plan's diagnostic-testing provision — two different post-deductible rates apply to two different parts of this one claim.
Correct output: proposed_category "complex-math", category_detail "multiple line items at different coverage rates interacting with a deductible threshold". Reasoning: this looks at first like routine deductible accounting (which alone would be clean), but the crossing here does change the outcome in a materially interesting way — the office-visit and diagnostic-testing lines land on genuinely different rates once past the threshold, not one flat rate for the whole remainder. That's exactly the "multiple line items interacting with a threshold" pattern, not routine, unremarkable deductible math.

Example 5 — Ambiguous (responsible-party conflict from inconsistent statements):
Claim: Diagnosis S62.001A (fracture of navicular bone, right wrist). Condition code marks the encounter as possibly employment-related. Remarks note the patient told intake staff the injury happened "lifting a box during my shift," but a separate nurse's note from the same visit records the patient saying it happened "carrying groceries in from my car at lunch."
Correct output: proposed_category "ambiguous", category_detail "responsible-party conflict — inconsistent patient statements about whether the injury occurred at work". Reasoning: the same encounter contains two directly conflicting first-person accounts of where the injury happened, which determines whether workers' compensation or standard health coverage is the responsible payer — an unresolvable coordination-of-benefits/responsible-party question, not a clean claim, and not fraud absent any other red flag.`;

export async function runAnalysis(
  claims: GeneratedClaim[],
  providerHistory: ProviderHistoryEntry[],
  registry: ClaimNumberRegistry,
  provider: ModelProvider = 'anthropic',
): Promise<AnalysisResult[]> {
  const claimBlocks = claims.map((c) => formatClaimForPrompt(c, claims, providerHistory, registry)).join('\n\n');
  // Reasoning field kept for Claude (a clear net positive there), dropped
  // for Kimi (its best two results both came without it) — see
  // buildResultSchema's own comment for the full history.
  const includeReasoning = provider !== 'kimi';
  const systemPrompt = `${buildSystemPrompt(includeReasoning)}\n\n${FEW_SHOT_ADDENDUM}`;
  // A distinct decision from includeReasoning above, even though both
  // currently key off the same provider check — this one exists because
  // Anthropic's structured outputs reject `maxItems` outright (see
  // buildResultSchema's own comment), not because of anything about
  // reasoning/thinking. Kept as its own explicit parameter so the two don't
  // silently drift into meaning the same thing if either provider's
  // behavior changes independently later.
  const resultSchema = buildResultSchema(includeReasoning, provider === 'kimi');
  // The model only ever sees/returns the opaque display number — never the
  // real claim_id, which encodes the authored scenario in its own text (see
  // project-spec.txt Section 7d). Translated back to the real claim_id below,
  // once completeness against these same display IDs is confirmed, so every
  // caller of runAnalysis keeps working with real claim_ids exactly as before.
  const displayIds = claims.map((c) => registry.toDisplay(c.claim_id));

  const raw = await withCompletenessRetry({
    label: 'runAnalysis',
    expectedIds: displayIds,
    getId: (r: AnalysisResult) => r.claim_id,
    attempt: async () => {
      // Bumped from 8000 (Pass A0): adaptive thinking's own token spend is
      // unpredictable and shares this same budget with the actual JSON
      // output — observed live during Pass A0 verification, a run that
      // spent ~3200 of ~3300 total tokens on thinking alone left almost no
      // room for the results array, well short of max_tokens but still an
      // early, voluntary stop (stop_reason "end_turn"). More headroom
      // reduces how often that happens; it doesn't fix the underlying
      // array-completeness gap that withCompletenessRetry exists for.
      //
      // Set to 15,000 at Pass G (2026-08-06): a live 20-claim Kimi run used
      // 10,316 of the previous 16,000 ceiling (64%, finish_reason "stop") —
      // real, proven headroom at exactly the chunk size Pass G's batching
      // now runs at. Trimmed slightly from that measured-safe 16,000 while
      // still keeping real margin above the observed number on purpose
      // (Joseph's own call), given Kimi's own documented tendency to run
      // long on harder claims (see the evidence-field tightening note
      // elsewhere in project-spec.txt).
      const text = await callModel({
        provider,
        // Bumped 15000 -> 15600 (2026-08-06) for the 132-claim expansion's slightly larger chunk size (20 -> 22 per
        // chunk, PIPELINE_TARGET_CHUNK_SIZE). Not diagnosed against fresh measurements — proactive headroom for a
        // ~10% larger chunk, on the assumption a live run will surface it directly if this still isn't enough.
        maxTokens: 15600,
        effort: PIPELINE_EFFORT,
        schemaName: 'claim_analysis',
        schema: resultSchema,
        system: systemPrompt,
        userMessage: `Analyze every one of the ${displayIds.length} claims below — for each, use the category set above to determine its category, then provide the required evidence and category_detail. Your results array MUST contain exactly ${displayIds.length} entries, one per claim_id, covering all of: ${displayIds.join(', ')}.\n\n${claimBlocks}`,
      });

      const parsed = JSON.parse(text) as { results: AnalysisResult[] };
      return parsed.results;
    },
  });

  return raw.map((r) => ({ ...r, claim_id: registry.toClaimId(r.claim_id) ?? r.claim_id }));
}
