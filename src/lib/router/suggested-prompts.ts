// Suggested Anchor prompts (Phase 8A) — project-spec.txt Section 1/7. Every
// prompt here is answerable by an existing Router tool without hitting an
// unsupported filter, a bulk action the Human Gate doesn't offer, or a
// contradiction in the taxonomy itself (Section 7a/7c) — the whole point of
// this bank is that clicking any pill produces a real, unambiguous answer,
// never a "sorry, I can't do that."
//
// 'general' prompts don't need a claim in view (dashboard-level Anchor, no
// card open). 'claim' prompts assume a specific claim is already open and
// reference "this claim" — they're a genuinely different chip set from the
// dashboard's, not a subset of it (a card-level question can still draw from
// 'general' too, since a claim being open doesn't stop a policy question).

export type PromptCategory = 'action' | 'regulatory' | 'fraud' | 'coverage' | 'self-explain' | 'aggregate';
export type PromptScope = 'general' | 'claim';

export interface SuggestedPrompt {
  text: string;
  category: PromptCategory;
  scope: PromptScope;
}

/** Template token substituted with a real provider name at draw time — see pickSuggestedPrompts(). */
const PROVIDER_TOKEN = '{{provider}}';

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  // ---- action (dashboard-level bulk operations) ----
  { text: 'Show me all flagged claims.', category: 'action', scope: 'general' },
  { text: `Show me claims from ${PROVIDER_TOKEN}.`, category: 'action', scope: 'general' },
  { text: 'Show me everything needing approval.', category: 'action', scope: 'general' },
  { text: 'Draft escalation notes for all claims recommended for escalation.', category: 'action', scope: 'general' },

  // ---- regulatory deadlines (ERISA / prompt-pay) ----
  { text: 'What does ERISA require for pre-service claims?', category: 'regulatory', scope: 'general' },
  { text: "What's the deadline for a standard post-service claim?", category: 'regulatory', scope: 'general' },
  { text: "What's the deadline for an urgent claim decision?", category: 'regulatory', scope: 'general' },
  { text: 'What are state prompt-pay laws?', category: 'regulatory', scope: 'general' },
  { text: 'What counts as a "clean" claim under prompt-pay rules?', category: 'regulatory', scope: 'general' },
  { text: 'Does the SLA clock pause for missing information?', category: 'regulatory', scope: 'general' },
  { text: "What's the difference between pre- and post-service claims?", category: 'regulatory', scope: 'general' },

  // ---- fraud terminology ----
  { text: 'What is phantom billing?', category: 'fraud', scope: 'general' },
  { text: 'What is upcoding?', category: 'fraud', scope: 'general' },
  { text: "What's the difference between upcoding and unbundling?", category: 'fraud', scope: 'general' },
  { text: 'What is double billing?', category: 'fraud', scope: 'general' },
  { text: "What's billing for unnecessary or substandard care?", category: 'fraud', scope: 'general' },
  { text: 'Why does a billing-volume spike matter?', category: 'fraud', scope: 'general' },
  { text: 'Which fraud categories are FinCEN-specific vs. industry-standard?', category: 'fraud', scope: 'general' },
  { text: 'How does unbundling differ from itemized billing?', category: 'fraud', scope: 'general' },

  // ---- coverage & adjudication policy ----
  { text: "How is a claim's covered amount calculated?", category: 'coverage', scope: 'general' },
  { text: "What happens if the deductible hasn't been met?", category: 'coverage', scope: 'general' },
  { text: 'How does out-of-network status affect coverage?', category: 'coverage', scope: 'general' },
  { text: 'When is prior authorization required?', category: 'coverage', scope: 'general' },
  { text: 'What happens when two insurance plans are involved?', category: 'coverage', scope: 'general' },

  // ---- self-explanation (ClaimsDock's own taxonomy — not RAG-grounded, no source doc to cite) ----
  { text: "What's the difference between severity and confidence?", category: 'self-explain', scope: 'general' },
  { text: "What does 'flagged' vs. 'needs approval' mean?", category: 'self-explain', scope: 'general' },
  { text: 'Why would a claim auto-approve without human review?', category: 'self-explain', scope: 'general' },
  { text: "What's a material vs. non-material missing field?", category: 'self-explain', scope: 'general' },
  { text: 'What happens when a claim is escalated?', category: 'self-explain', scope: 'general' },
  { text: "What's required to formally deny a claim?", category: 'self-explain', scope: 'general' },
  { text: 'Why do some visits generate two separate claims?', category: 'self-explain', scope: 'general' },
  { text: "Why isn't there an \"Overdue\" status in ClaimsDock?", category: 'self-explain', scope: 'general' },
  { text: "What's an example of a complex, non-fraud claim?", category: 'self-explain', scope: 'general' },
  { text: "What's the difference between CMS-1500 and UB-04?", category: 'self-explain', scope: 'general' },
  { text: 'How can I change the appearance of ClaimsDock?', category: 'self-explain', scope: 'general' },
  { text: 'Where can I switch ClaimsDock to dark mode?', category: 'self-explain', scope: 'general' },
  { text: 'How can I change the AI model Anchor uses?', category: 'self-explain', scope: 'general' },
  { text: 'Where can I see a diagram of how ClaimsDock works?', category: 'self-explain', scope: 'general' },

  // ---- aggregate (only counts — nothing here needs a group-by or an average) ----
  { text: 'How many claims have been auto-approved?', category: 'aggregate', scope: 'general' },
  { text: 'How many claims are currently flagged for fraud?', category: 'aggregate', scope: 'general' },

  // ---- claim-context (a specific claim is already open) ----
  { text: 'Show me any claims linked to this one.', category: 'action', scope: 'claim' },
  { text: "How was this claim's covered amount calculated?", category: 'coverage', scope: 'claim' },
  { text: "What would change this claim's severity?", category: 'self-explain', scope: 'claim' },
  { text: 'Tell me about this claim.', category: 'self-explain', scope: 'claim' },
  { text: 'Why was this action recommended?', category: 'action', scope: 'claim' },
  { text: 'Does anything about this claim look off?', category: 'fraud', scope: 'claim' },
  { text: "Is this provider's history notable?", category: 'fraud', scope: 'claim' },
  { text: "When is this claim's deadline, and why?", category: 'regulatory', scope: 'claim' },
  { text: 'Why is this claim covered the way it is?', category: 'coverage', scope: 'claim' },
  { text: 'What happens next with this claim?', category: 'action', scope: 'claim' },
  { text: "What would change this claim's category?", category: 'self-explain', scope: 'claim' },
  { text: "Is this claim's deadline at risk?", category: 'regulatory', scope: 'claim' },
];

/**
 * Stratified random draw: buckets by category first, then round-robins
 * through a shuffled bucket order so a small draw (2-4, the pill-row size)
 * can't cluster on one category by chance the way pure uniform-random over
 * the whole bank could. Falls back to plain random fill if a category runs
 * out before `count` is reached.
 *
 * `scope: 'general'` (dashboard, no claim open) draws only from general
 * prompts. `scope: 'claim'` draws from the full bank, since a claim being
 * open doesn't remove the ability to ask a general policy question.
 */
export function pickSuggestedPrompts(
  count: number,
  options: { scope: PromptScope; providerNames?: string[] } = { scope: 'general' },
): string[] {
  const { scope, providerNames = [] } = options;
  const pool = scope === 'general' ? SUGGESTED_PROMPTS.filter((p) => p.scope === 'general') : SUGGESTED_PROMPTS;

  const buckets = new Map<PromptCategory, SuggestedPrompt[]>();
  for (const prompt of pool) {
    const bucket = buckets.get(prompt.category) ?? [];
    bucket.push(prompt);
    buckets.set(prompt.category, bucket);
  }
  // shuffle() is pure (returns a new array, doesn't mutate its input) — the
  // result has to be written back, or the bucket stays in original
  // declaration order and .pop() always grabs the same last-declared entry
  // every time. Found live 2026-08-03: this masked-since-inception bug only
  // surfaced once a suggested-prompt removal changed which entry was last.
  for (const [category, bucket] of buckets) {
    buckets.set(category, shuffle(bucket));
  }

  const categoryOrder = shuffle([...buckets.keys()]);
  const picked: SuggestedPrompt[] = [];
  let round = 0;
  while (picked.length < count && picked.length < pool.length) {
    const category = categoryOrder[round % categoryOrder.length];
    const bucket = buckets.get(category)!;
    if (bucket.length > 0) picked.push(bucket.pop()!);
    round += 1;
    // Every category exhausted this pass with nothing picked -> pool is smaller than count.
    if (round % categoryOrder.length === 0 && categoryOrder.every((c) => buckets.get(c)!.length === 0)) break;
  }

  return picked.map((p) => substituteProvider(p.text, providerNames));
}

function substituteProvider(text: string, providerNames: string[]): string {
  if (!text.includes(PROVIDER_TOKEN)) return text;
  if (providerNames.length === 0) return text.replace(PROVIDER_TOKEN, 'a specific provider');
  const name = providerNames[Math.floor(Math.random() * providerNames.length)];
  return text.replaceAll(PROVIDER_TOKEN, name);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
