// Shared model-call layer for the three schema-based calls (Call 1, Call 2,
// and the Deny justification-quality check) — Phase 12 Pass A. Anchor's
// tool-use loop is deliberately NOT unified behind this: its multi-round,
// tool-dispatch shape differs enough between providers (tool-array nesting,
// tool_choice semantics, no single "final JSON" response) that forcing it
// through the same interface would just be a leaky abstraction. That's its
// own, later consolidation.
//
// The two providers are NOT symmetric, and this file doesn't pretend they
// are: Claude gets adaptive thinking + Anthropic's native output_config
// json_schema; Kimi (Moonshot's OpenAI-compatible /v1 endpoint — NOT the
// undocumented /anthropic compatibility surface, see project-spec.txt's
// Phase 12 research notes) gets OpenAI-shaped response_format json_schema
// and no thinking param at all. One shared entry point, two real branches.

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export type ModelProvider = 'anthropic' | 'kimi';

export const ANTHROPIC_PIPELINE_MODEL = 'claude-sonnet-5';
export const KIMI_PIPELINE_MODEL = 'kimi-k2.6';

let anthropicClient: Anthropic | null = null;
export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

let kimiClient: OpenAI | null = null;
export function getKimiClient(): OpenAI {
  if (!kimiClient) {
    kimiClient = new OpenAI({
      apiKey: process.env.KIMI_API_KEY,
      baseURL: 'https://api.moonshot.ai/v1',
      // This SDK-level timeout turned out not to fire reliably on its own
      // (observed live: a request ran 11+ minutes past a configured 240s
      // value with no error) — withHardTimeout() below is the real
      // enforcement now. Kept as a generous backstop, set safely above that
      // wrapper's own ceiling (bumped alongside it at Pass G, 2026-08-06 —
      // see withHardTimeout's own call site) so it's never the binding
      // constraint.
      timeout: 400_000,
      maxRetries: 0,
    });
  }
  return kimiClient;
}

// The openai SDK's own `timeout` constructor option did NOT reliably fire
// on a real 20-claim batch request — observed live (2026-08-02): a request
// sat for 11+ minutes past the configured 240s timeout with no error ever
// thrown. Rather than keep trusting SDK-internal timeout handling, this
// wraps every call in a manual race so a hang is caught by code this
// project actually controls, regardless of why the SDK's own bound didn't
// fire.
export function withHardTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`callModel(${label}): hard timeout after ${ms}ms`)), ms);
  });
  // Whichever side of the race settles first, the timer must be cleared —
  // otherwise the losing side's setTimeout stays scheduled in Node's event
  // loop for its full duration, keeping the process alive well after the
  // real work is done (observed live: a finished script sat around for
  // minutes with nothing left to do, waiting on a stray timer to expire).
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export interface CallModelParams {
  provider: ModelProvider;
  system: string;
  userMessage: string;
  maxTokens: number;
  /** Anthropic's output_config.effort — ignored on the Kimi branch, which has no equivalent. */
  effort: 'low' | 'medium' | 'high';
  /** A short, schema-identifying name — required by OpenAI-style response_format.json_schema, unused by Anthropic. */
  schemaName: string;
  schema: Record<string, unknown>;
}

export async function callModel(params: CallModelParams): Promise<string> {
  if (params.provider === 'anthropic') {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: ANTHROPIC_PIPELINE_MODEL,
      max_tokens: params.maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: params.effort, format: { type: 'json_schema', schema: params.schema } },
      system: params.system,
      messages: [{ role: 'user', content: params.userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error(`callModel(anthropic): no text block in response (stop_reason: ${response.stop_reason})`);
    }
    return textBlock.text;
  }

  const client = getKimiClient();
  const response = await withHardTimeout(
    client.chat.completions.create({
      model: KIMI_PIPELINE_MODEL,
      max_tokens: params.maxTokens,
      // No temperature override — tried 2026-08-06, confirmed via a real API error that Kimi K2.6 pins temperature
      // server-side ("only 0.6 is allowed for this model") and rejects any other value outright. Not a tunable lever
      // for this model; see guardrails.ts's own note at the Deny check's call site for why this was tried.
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.userMessage },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: params.schemaName, strict: true, schema: params.schema },
      },
      // K2.6-specific extension, not in the OpenAI SDK's own types (hence the
      // cast). Explicitly DISABLED, not enabled. Re-checked once more
      // (2026-08-02) after the prompt/schema had changed substantially from
      // the original finding — still reproduces: a real 20-claim Call 1
      // request with thinking enabled timed out outright (340s wrapper),
      // same call, same fundamental problem as the original whitespace-
      // flooding discovery, just manifesting as a timeout at this batch
      // size instead of a truncated response on a tiny test schema.
      // Disabling it is still what actually works.
      ...({ thinking: { type: 'disabled' } } as Record<string, unknown>),
    }),
    // Bumped from 340s to 380s at Pass G (2026-08-06): a live 20-claim
    // Call 2 run came close enough to the old 340s ceiling to be a real
    // concern, even though it completed — chunking (this same pass) should
    // make individual calls faster going forward, but the extra margin
    // costs nothing and removes a near-miss.
    380_000,
    'kimi',
  );

  // Temporary — Pass G token-usage diagnostic (2026-08-06). Nothing in this
  // file had ever logged real usage numbers before, so there was no
  // empirical basis for whether maxTokens: 16000 was anywhere near what a
  // batch actually consumes. Remove once Pass G's batching design is settled.
  if (process.env.LOG_TOKEN_USAGE) {
    console.log(
      `[token-usage] schema=${params.schemaName} maxTokens=${params.maxTokens} ` +
        `prompt_tokens=${response.usage?.prompt_tokens} completion_tokens=${response.usage?.completion_tokens} ` +
        `total_tokens=${response.usage?.total_tokens} finish_reason=${response.choices[0]?.finish_reason}`,
    );
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`callModel(kimi): no content in response (finish_reason: ${response.choices[0]?.finish_reason})`);
  }
  // Truncated content is still truthy — without this check a response cut
  // off mid-JSON (finish_reason "length") slips through as if it were
  // complete, and the caller's own JSON.parse throws an opaque syntax error
  // instead of a message that names what actually happened. Found live
  // 2026-08-06 via the Deny justification-quality check: its prompt has
  // grown substantially (DENY_FIELD_REQUIREMENTS plus the anti-fabrication/
  // multi-theory additions), pushing Kimi's real per-field feedback text
  // close enough to that call's maxTokens to truncate intermittently.
  if (response.choices[0]?.finish_reason === 'length') {
    throw new Error(`callModel(kimi): response truncated at maxTokens (${params.maxTokens}), schema=${params.schemaName}`);
  }
  return content;
}
