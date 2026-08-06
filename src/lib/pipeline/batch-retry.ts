// Structured outputs (output_config.format) constrain each array item's
// shape but can't express "exactly N items, one per this ID list" — array-
// length constraints aren't supported (see the claude-api skill's JSON
// Schema Limitations). Real smoke-testing against the live API showed this
// isn't hypothetical: a batched call occasionally comes back short a claim
// or two, with otherwise-valid JSON and stop_reason "end_turn" — the model
// just didn't generate every entry. Retrying is the correct response to that
// kind of run-to-run variance, not a code bug to chase further.

export async function withCompletenessRetry<T>(params: {
  attempt: () => Promise<T[]>;
  getId: (item: T) => string;
  expectedIds: string[];
  label: string;
  maxAttempts?: number;
}): Promise<T[]> {
  const maxAttempts = params.maxAttempts ?? 3;
  let lastMissing: string[] = [];

  for (let i = 1; i <= maxAttempts; i++) {
    const results = await params.attempt();
    const returnedIds = new Set(results.map(params.getId));
    const missing = params.expectedIds.filter((id) => !returnedIds.has(id));
    if (missing.length === 0) return results;

    lastMissing = missing;
    console.warn(
      `${params.label}: attempt ${i}/${maxAttempts} missing ${missing.length} claim(s) (${missing.join(', ')}) — retrying`,
    );
  }

  throw new Error(
    `${params.label}: still missing ${lastMissing.length} claim(s) after ${maxAttempts} attempts: ${lastMissing.join(', ')}`,
  );
}

// Phase 13 Pass G — a distinct failure mode from the one above:
// withCompletenessRetry only retries a response that came back incomplete;
// it does nothing if the request itself throws (a network blip, a real
// APIConnectionTimeoutError). Found live 2026-08-06 once chunking turned 2
// total API calls into 12 per Pipeline run — a single transient failure on
// one chunk otherwise aborts the whole Promise.all, discarding the other
// (already-succeeded, already-paid-for) chunks' results too. This wraps one
// chunk's own call so that specific chunk retries in place instead.
export async function withChunkRetry<T>(attempt: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${label}: attempt ${i}/${maxAttempts} threw (${message}) — retrying`);
    }
  }
  throw lastError;
}
