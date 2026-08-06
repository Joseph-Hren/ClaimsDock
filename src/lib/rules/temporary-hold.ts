// Corrected 2026-07-28, while building Phase 7: this turned out not to be a
// temporary stand-in at all. There are two genuinely separate things here —
// (1) the SLA clock pausing, and (2) the claim's *status* becoming
// "Additional Info Requested" — and only (2) needs a real human action
// (built in src/lib/humangate/actions.ts, Phase 7). (1) is a deterministic
// fact: a claim missing a required field was never "clean" from the moment
// it was submitted (project-spec.txt Section 5a — "the clock only starts
// once a claim is clean"), so the clock correctly never starts counting
// against the payer for it, independent of whether a human has looked at it
// yet. That's exactly what this function already does, and it's correct
// permanently, not just until Phase 7 landed — so this file stays.
//
// Also corrected here: this previously checked claim._testMeta directly —
// authoring metadata that's explicitly never supposed to drive real system
// logic (format-claim.ts strips it before any claim reaches the model, for
// exactly this reason). It now uses missing-fields.ts's deterministic
// scanner instead, which checks the actual data rather than the answer key
// — the two agree on every seed claim today, but only one of them is
// something a real, non-synthetic claim could ever have.
//
// computeSlaStatus itself takes heldSince as a plain parameter and doesn't
// know this function exists.

import type { Claim } from '../claims/types';
import { hasMaterialMissingField } from './missing-fields';

export function temporaryHeldSince(claim: Claim, submittedDate: Date): Date | null {
  return hasMaterialMissingField(claim) ? submittedDate : null;
}
