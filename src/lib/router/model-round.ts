// Per-round model-call abstraction for Anchor's tool-use loop (Phase 13
// Pass A) — NOT the same thing as pipeline/model-client.ts's callModel(),
// which is single-shot/schema-constrained and, by its own comment,
// deliberately excludes this multi-round, tool-dispatch shape ("tool-array
// nesting, tool_choice semantics, no single 'final JSON' response... its
// own, later consolidation"). This file is that later consolidation.
//
// The goal is a single round-budget loop in anchor.ts, provider-agnostic in
// shape (round count, executeTool dispatch, message-history bookkeeping
// unchanged regardless of provider) — with only the actual per-round
// request/response translation living here, one branch per provider. The
// loop treats RouterState as opaque and never inspects a provider's native
// message shape directly.

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getAnthropicClient, getKimiClient, withHardTimeout } from '../pipeline/model-client';
import type { ModelProvider } from '../pipeline/model-client';
import { ROUTER_TOOLS, KIMI_ROUTER_TOOLS } from './tool-definitions';

// Same tier as the Pipeline's own model choice for each provider — routing
// among four well-separated tools is a narrower classification problem
// than the Pipeline's category call, which already proved reliable at this
// tier. Kept as separate constants from ANTHROPIC_PIPELINE_MODEL/
// KIMI_PIPELINE_MODEL (model-client.ts) rather than importing those, the
// same way ROUTER_MODEL was already its own constant before this file
// existed — the Router and the Pipeline are independently adjustable
// config points by design, even when their values happen to match today.
const ROUTER_MODEL_ANTHROPIC = 'claude-sonnet-5';
const ROUTER_MODEL_KIMI = 'kimi-k2.6';
const ROUTER_EFFORT = 'low' as const;

// A single interactive Q&A round is much smaller than the Pipeline's
// 20-claim batch call — 90s is a generous ceiling for that, well under the
// Pipeline's own 340s (tuned for batch scale). Revisit if live testing
// shows real Kimi round-trip latency needs more room.
const KIMI_ROUND_TIMEOUT_MS = 90_000;

export interface RouterToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type RouterRoundResult =
  | { kind: 'text'; text: string }
  | { kind: 'tool_calls'; calls: RouterToolCall[] };

export type RouterState =
  | { provider: 'anthropic'; messages: Anthropic.MessageParam[] }
  | { provider: 'kimi'; messages: OpenAI.Chat.ChatCompletionMessageParam[] };

export function initRouterState(provider: ModelProvider, contextualizedQuestion: string): RouterState {
  return { provider, messages: [{ role: 'user', content: contextualizedQuestion }] } as RouterState;
}

export async function callRouterRound(
  state: RouterState,
  systemPrompt: string,
): Promise<{ result: RouterRoundResult; state: RouterState }> {
  if (state.provider === 'anthropic') {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: ROUTER_MODEL_ANTHROPIC,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: ROUTER_EFFORT },
      system: systemPrompt,
      tools: ROUTER_TOOLS,
      messages: state.messages,
    });

    const newMessages: Anthropic.MessageParam[] = [...state.messages, { role: 'assistant', content: response.content }];
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
      return {
        result: { kind: 'text', text: textBlock?.text ?? '' },
        state: { provider: 'anthropic', messages: newMessages },
      };
    }

    const calls: RouterToolCall[] = toolUseBlocks.map((b) => ({
      id: b.id,
      name: b.name,
      input: b.input as Record<string, unknown>,
    }));
    return { result: { kind: 'tool_calls', calls }, state: { provider: 'anthropic', messages: newMessages } };
  }

  const client = getKimiClient();
  const response = await withHardTimeout(
    client.chat.completions.create({
      model: ROUTER_MODEL_KIMI,
      max_tokens: 4000,
      messages: [{ role: 'system', content: systemPrompt }, ...state.messages],
      tools: KIMI_ROUTER_TOOLS as OpenAI.Chat.ChatCompletionTool[],
      tool_choice: 'auto',
      // Same finding as the Pipeline's own Kimi calls (model-client.ts) —
      // thinking left enabled has caused real hangs/timeouts on this
      // model. Disabled here too rather than assuming a smaller,
      // single-round request is immune.
      ...({ thinking: { type: 'disabled' } } as Record<string, unknown>),
    }),
    KIMI_ROUND_TIMEOUT_MS,
    'anchor-kimi-round',
  );

  const message = response.choices[0]?.message;
  const newMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...state.messages,
    { role: 'assistant', content: message?.content ?? null, tool_calls: message?.tool_calls },
  ];

  if (!message?.tool_calls || message.tool_calls.length === 0) {
    return {
      result: { kind: 'text', text: message?.content ?? '' },
      state: { provider: 'kimi', messages: newMessages },
    };
  }

  const calls: RouterToolCall[] = message.tool_calls.map((tc) => ({
    id: tc.id,
    name: tc.type === 'function' ? tc.function.name : '',
    input: tc.type === 'function' ? (JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>) : {},
  }));
  return { result: { kind: 'tool_calls', calls }, state: { provider: 'kimi', messages: newMessages } };
}

export function appendToolResults(state: RouterState, calls: RouterToolCall[], results: unknown[]): RouterState {
  if (state.provider === 'anthropic') {
    const toolResults: Anthropic.ToolResultBlockParam[] = calls.map((call, i) => ({
      type: 'tool_result',
      tool_use_id: call.id,
      content: JSON.stringify(results[i]),
    }));
    return { provider: 'anthropic', messages: [...state.messages, { role: 'user', content: toolResults }] };
  }

  const toolMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = calls.map((call, i) => ({
    role: 'tool',
    tool_call_id: call.id,
    content: JSON.stringify(results[i]),
  }));
  return { provider: 'kimi', messages: [...state.messages, ...toolMessages] };
}

export async function callFinalTextOnly(state: RouterState, systemPrompt: string): Promise<string> {
  // Strengthened 2026-08-06 after a real live failure: the original,
  // looser wording here produced a bare, half-finished thought ("I need to
  // ground the plan/policy provision properly. Let me search...") instead
  // of an actual answer — the model stated what it was ABOUT to do next
  // rather than synthesizing from what it already had, with no follow-up
  // question offered either, despite the instruction already asking for
  // one. Now explicit about both failure points: give whatever
  // well-grounded partial content the tool results above actually support
  // (never restate an intention to look something up — that round is
  // gone), name the SPECIFIC part that couldn't be completed, and end with
  // a concrete, specific follow-up question the adjuster could ask next —
  // never a generic "try asking a narrower question" with nothing to
  // narrow from.
  const forcedPrompt = `${systemPrompt}\n\nYou are out of tool-use rounds for this exchange — do not attempt another tool call, and do not describe a tool call you would have made next. Using ONLY the tool results already gathered above, give the most complete answer they actually support. If part of the question isn't covered by what's above, name that specific part plainly and end with one concrete, specific follow-up question the adjuster could ask to get it — not a generic suggestion to ask something narrower.`;
  const fallback = "I gathered some information but ran out of room to fully answer this in one exchange — try asking about one specific part of it instead.";

  if (state.provider === 'anthropic') {
    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: ROUTER_MODEL_ANTHROPIC,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: ROUTER_EFFORT },
      system: forcedPrompt,
      messages: state.messages,
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    return textBlock?.text ?? fallback;
  }

  const client = getKimiClient();
  const response = await withHardTimeout(
    client.chat.completions.create({
      model: ROUTER_MODEL_KIMI,
      max_tokens: 4000,
      messages: [{ role: 'system', content: forcedPrompt }, ...state.messages],
      ...({ thinking: { type: 'disabled' } } as Record<string, unknown>),
    }),
    KIMI_ROUND_TIMEOUT_MS,
    'anchor-kimi-final',
  );
  return response.choices[0]?.message?.content ?? fallback;
}
