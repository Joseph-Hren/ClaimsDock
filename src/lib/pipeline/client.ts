// Single Anthropic client for both Pipeline calls — reads ANTHROPIC_API_KEY
// from the environment (never the client, per CLAUDE.md's "same discipline
// as AUGUR" rule), constructed once and reused across a process lifetime.

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

// Sonnet — model/effort tier for both Pipeline calls.
// Tried bumping 'low' to 'medium' during Pass A0 (2026-07-31) to address a
// live-testing-surfaced reliability gap in runConfidence (see batch-retry.ts
// and orchestrator.ts) — made it no better, arguably worse (more outright
// failures across 3 attempts, with the same claims missing on every retry
// within a run, not just occasional variance). Reverted to 'low'; the actual
// fix looks like it needs to be architectural (chunking Call 2 into smaller
// sub-batches), not a config tier, and belongs with Phase 11 Pass D's
// batching-strategy work rather than a parameter tweak here.
export const PIPELINE_MODEL = 'claude-sonnet-5';
export const PIPELINE_EFFORT = 'low' as const;
