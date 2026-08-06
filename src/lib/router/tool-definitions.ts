// The four Router tools (project-spec.txt Section 1), as real Anthropic
// tool-use definitions. The model picks one per question and extracts
// parameters as a judgment call — decided 2026-07-26 specifically because
// the three failure modes (wrong tool, right tool/wrong params, Reference
// Lookup misclassification) only make sense as risks if a model is doing
// the classifying, not deterministic string-matching.

const STATUS_VALUES = [
  'Submitted, no flags',
  'Submitted, flagged',
  'Needs Approval',
  'Additional Info Requested',
  'Denied',
  'Escalated',
  'Resolved',
] as const;

const SEVERITY_VALUES = ['Low', 'Moderate', 'High', 'Critical'] as const;
const CATEGORY_VALUES = ['fraud', 'ambiguous', 'missing-data', 'complex-math', 'clean'] as const;
const RECOMMENDED_ACTION_VALUES = ['Approve', 'Approve as calculated', 'Escalate', 'Deny', 'Request Additional Info'] as const;

export const ROUTER_TOOLS = [
  {
    name: 'lookup_claim',
    description:
      'Look up facts about a specific claim by ID, OR a filtered list of claims matching any combination of status/severity/category/patient/provider/dollar amount/SLA%/recommended action. Use this for "what\'s the status of claim X" (claim_id) as well as broad queries like "show me problem claims," "claims over $10,000," or "claims where the recommended action is Deny" (filter). For a genuinely ambiguous filter term, still call this tool with your best-guess filter — you will state the interpretation and offer alternatives in your final answer, not by withholding the tool call. A filtered result also returns a total dollar amount and a category/status/severity breakdown computed over every match — use those numbers directly for any "how many" or "what\'s the total" question rather than counting or summing the listed matches yourself.',
    input_schema: {
      type: 'object' as const,
      properties: {
        claim_id: { type: 'string', description: 'A specific claim ID, e.g. "CLM-4821-039571". Omit if using filter instead.' },
        filter: {
          type: 'object',
          description: 'A structured filter for a broad, multi-claim query. Omit if claim_id is provided. Any combination of fields may be used together.',
          properties: {
            status: {
              description: 'One status, or an array of statuses (e.g. ["Submitted, flagged", "Needs Approval", "Escalated"] for "still active").',
              anyOf: [{ type: 'string', enum: STATUS_VALUES }, { type: 'array', items: { type: 'string', enum: STATUS_VALUES } }],
            },
            severity: { type: 'string', enum: SEVERITY_VALUES },
            category: { type: 'string', enum: CATEGORY_VALUES },
            patient_name: { type: 'string', description: 'Substring match against the patient\'s name — a partial or misspelled name is fine, e.g. "Nakamura" or "Walter".' },
            provider_name: { type: 'string', description: 'Substring match against the billing provider\'s name.' },
            min_amount: { type: 'number', description: 'Only claims billed at or above this dollar amount, e.g. 10000 for "over $10,000."' },
            max_amount: { type: 'number', description: 'Only claims billed at or below this dollar amount.' },
            max_sla_percent_remaining: { type: 'number', description: 'Only claims with this percentage (0-100) or less of their SLA window remaining, e.g. 10 for "less than 10% of the SLA time remaining."' },
            recommended_action: { type: 'string', enum: RECOMMENDED_ACTION_VALUES, description: 'Only claims whose recommended action exactly matches, e.g. "Deny."' },
          },
        },
      },
    },
  },
  {
    name: 'analyze_claim',
    description:
      'Re-surface (or, if recheck is true, re-run) the fraud/ambiguity/coverage evidence for a specific claim — "does this look off." Requires a claim ID. Deep analysis is one claim per call — if a question spans more claims than comfortably fit in the remaining tool-use budget for this exchange (roughly 3), analyze as many as you reasonably can and tell the adjuster you\'re doing a deep dive on those first, offering to continue for the rest, rather than silently stopping partway or trying to force all of them into one exchange. Default (recheck omitted or false) returns the already-computed evidence instantly; only set recheck: true if the adjuster explicitly asks to re-check, re-run, or redo the analysis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        claim_id: { type: 'string', description: 'The claim ID to analyze.' },
        recheck: { type: 'boolean', description: 'True only for an explicit re-check/re-run request. Defaults to false.' },
      },
      required: ['claim_id'],
    },
  },
  {
    name: 'recommend_action',
    description:
      'Explain — and draft supporting language for — the recommended action already computed for one claim or a small group of claims (up to 10 at once) — "what should I do with this" or "draft an approval note for these." This only explains/drafts; it never approves, denies, or escalates anything, and it never contradicts the recommended_action already on record for a claim — your job is to justify and articulate that recommendation (and, for Deny, help structure the four-part justification), not compute a new one. Requesting more than 10 claims at once returns only the first 10 with a note that more were requested — say so, and offer to continue for the rest.',
    input_schema: {
      type: 'object' as const,
      properties: {
        claim_id: { type: 'string', description: 'A single claim ID to draft for. Omit if using claim_ids instead.' },
        claim_ids: { type: 'array', items: { type: 'string' }, description: 'Multiple claim IDs (up to 10) to draft one combined message for. Omit if using claim_id instead.' },
      },
    },
  },
  {
    name: 'reference_lookup',
    description:
      'Answer a general policy or regulatory question, independent of any specific claim — e.g. "what does ERISA require for pre-service claims" or "what counts as upcoding." Do NOT use this for a question about a specific claim currently in view (use analyze_claim, recommend_action, or lookup_claim instead) — use this only when the question is general and would be answered the same way regardless of which claim, if any, is open.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'The general policy/regulatory question, verbatim or lightly cleaned up.' },
      },
      required: ['question'],
    },
  },
];

interface OpenAIToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function toOpenAITool(tool: (typeof ROUTER_TOOLS)[number]): OpenAIToolDef {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

// Kimi's OpenAI-compatible endpoint expects tools in OpenAI's own shape
// ({type:'function', function:{name, description, parameters}}), not
// Anthropic's ({name, description, input_schema}) — converted from the one
// canonical ROUTER_TOOLS definition above rather than hand-maintained a
// second time (Phase 13 Pass A). This is the same discipline this project
// already learned the hard way once: a stale claim-ID format example baked
// into a static tool description (caught live 2026-08-01, tool-definitions
// .ts's own `lookup_claim` schema) was a bug hiding in a tool-schema surface
// distinct from runtime prompt content — a second hand-copied tool
// definition here would be exactly that kind of surface again.
export const KIMI_ROUTER_TOOLS: OpenAIToolDef[] = ROUTER_TOOLS.map(toOpenAITool);
