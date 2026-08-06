// Deterministic, opaque, realistic-looking claim numbers — the fix for the
// leak found during Phase 11 planning (project-spec.txt Section 7d): the
// internal claim_id (FRD-UPCODE-01, etc.) encodes the authored scenario
// directly in its text and must never reach a model call. One number per
// claim serves two jobs at once: the UI's display-facing claim number, and
// the only claim identifier ever sent to or received from a model (Pipeline,
// Router, Anchor alike — one rule, not a per-subsystem exception). The real
// claim_id stays the system's own internal join key, never forwarded.

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1aHash(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0; // unsigned 32-bit
}

/** A 10-digit string, never leading with 0, deterministic per input. */
function toTenDigits(unsigned: number): string {
  return (unsigned % 9_000_000_000 + 1_000_000_000).toString();
}

/**
 * Formatted as CLM-nnnn-nnnnnn rather than a bare 10-digit blob — both a
 * closer match to how a real claim reference number is typically presented,
 * and (found empirically during Pass A0's live verification) a real
 * reliability difference: a wall of 20 visually-uniform bare digit strings
 * measurably increased how often the batched Confidence call lost track
 * partway through and stopped early (stop_reason "end_turn" with only a
 * handful of the 20 expected results actually written) — a stable prefix and
 * grouping gives the model more to visually anchor on when tracking many
 * parallel findings at once.
 */
export function claimDisplayNumber(claimId: string): string {
  const digits = toTenDigits(fnv1aHash(claimId));
  return `CLM-${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export interface ClaimNumberRegistry {
  toDisplay(claimId: string): string;
  toClaimId(displayNumber: string): string | undefined;
}

/**
 * Builds the full registry for a claim set in one pass. Resolves the
 * (astronomically unlikely, but handled rather than assumed away) case of
 * two different claim_ids hashing to the same number by salting whichever
 * one is processed later in `claimIds`'s own order — deterministic given a
 * fixed input order, which is exactly why the Pipeline threads one shared
 * registry through both calls rather than letting each rebuild its own from
 * whatever order a model happened to return results in.
 */
export function buildClaimNumberRegistry(claimIds: string[]): ClaimNumberRegistry {
  const forward = new Map<string, string>();
  const reverse = new Map<string, string>();

  for (const claimId of claimIds) {
    let number = claimDisplayNumber(claimId);
    let salt = 0;
    while (reverse.has(number) && reverse.get(number) !== claimId) {
      salt += 1;
      number = claimDisplayNumber(`${claimId}#${salt}`);
    }
    forward.set(claimId, number);
    reverse.set(number, claimId);
  }

  return {
    toDisplay(claimId: string): string {
      const number = forward.get(claimId);
      if (!number) throw new Error(`claimDisplayNumber: unknown claim_id "${claimId}"`);
      return number;
    },
    toClaimId(displayNumber: string): string | undefined {
      return reverse.get(displayNumber);
    },
  };
}
