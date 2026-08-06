import { FRAUD_NONPAYMENT_PROVISION } from '../rules/coverage-constants';

// The single description of what each of the Deny justification's four
// fields actually requires — shared between the guardrail that JUDGES a
// submitted justification against it (guardrails.ts's DENIAL_SYSTEM_PROMPT)
// and Anchor's own instructions for DRAFTING one in the first place
// (router/anchor.ts's recommend_action tool description). Extracted
// 2026-08-06 after two independently-worded copies of "what each field
// needs" already drifted in practice — same principle already established
// elsewhere in this codebase for the same reason: content/corpora/
// coverage-policy.md is generated from coverage-constants.ts rather than
// hand-duplicated, so the cited policy and the actual calculation can
// never silently disagree. A shared requirements source doesn't prevent
// every future drafting mistake, but it means judge and drafter are always
// reasoning from the same definition rather than two texts that can
// independently go stale.
//
// Three rounds of real live failures shaped this text, each teaching
// something the previous round didn't cover: (1) field 2 citing the wrong
// document, field 3 describing facts without naming a standard, field 4
// claiming absolute certainty — fixed. (2) field 2 citing the RIGHT
// document but fabricating a provision not actually in it, field 4 naming
// evidence that didn't logically address the claim's fraud theory — fixed
// with the accuracy and logical-consistency language below. (3) field 2
// failing a THIRD time turned out to be a real corpus gap, not a drafting
// problem at all — the Coverage & Adjudication Policy had no fraud/
// non-payment provision anywhere for field 2 to ever correctly cite (fixed
// at the source, coverage-constants.ts's FRAUD_NONPAYMENT_PROVISION,
// 2026-08-06); the same round also found field 4 addressing only one of
// two alternative fraud theories field 1 had named ("upcoding OR phantom
// billing"), which the added guidance below now covers directly. (4) A
// fourth round, same day, found the opposite failure mode: the judge
// rejected a field-4 draft as "internally inconsistent" for offering
// evidence that the original upcoding allegation was wrong (documentation
// proving the higher code was actually justified), reasoning that this
// contradicted field 1's own theory. That reasoning doesn't follow — the
// judge, not the draft, was wrong: a reversal category is allowed to show
// the original theory doesn't hold, since that's what a reversal is. First
// written as an upcoding-specific carve-out. (5) A fifth round, same day,
// found the judge reusing that exact same flawed "disproving the theory is
// invalid" logic on a *different* theory pair (phantom billing vs.
// misrepresentation of who performed the service) — the upcoding-specific
// wording hadn't generalized. Rewritten below as a general rule instead of
// an upcoding-specific example. That same round also surfaced a sharper,
// previously-missing distinction: the judge correctly rejected a reversal
// category asking for evidence that would contradict a *linked claim's own
// already-established facts* (a facility claim already on file placing the
// procedure at a specific location/NPI) — different from the upcoding case,
// where nothing on file had settled the question either way. "The theory
// might be wrong" (a genuine gap) and "an already-confirmed fact in this
// claim's own record would have to be wrong" (not a gap, a contradiction)
// are different things, and only the first is a valid reversal category —
// now stated explicitly. The same round also found the judge's own
// suggested_replacement repeating the exact defect its own feedback had
// just named for the same field — the two are generated independently with
// nothing checking one against the other. Addressed with an explicit
// self-consistency instruction on suggested_replacement (guardrails.ts).
// (6) A sixth round, same claim, same day, exposed a genuinely deeper gap
// rather than another wording edge case: the judge's own feedback text had
// become internally incoherent ("cures theory X but doesn't address theory
// Y — it confirms exactly what theory Y alleges," which is self-defeating —
// evidence confirming a theory proves it, it doesn't leave it "unaddressed").
// Root cause: neither side had ever distinguished "evidence that this claim,
// as submitted, was actually correct" (a real reversal) from "a corrected/
// resubmitted claim under different billing information" (a NEW claim,
// separately adjudicated — not a reversal of THIS one's denial at all).
// Once a linked claim's own established facts (the actual location/NPI)
// already conclusively corroborate the misrepresentation — not just an
// internal inconsistency this claim's own numbers raised — there is no
// remaining scenario where the original submission was correct, and "a
// corrected claim could be filed" stops being a reversal category and
// becomes advice for a different claim. In that situation "No information
// could reverse this decision" isn't a fallback for failing to find
// something — it's the objectively correct answer, and both Anchor and the
// judge had been reaching past it toward a resubmission path neither
// instruction set had ever actually endorsed as a reversal. Made explicit
// below rather than left implicit.
// (7) A seventh round, different claim, exposed a real self-contradiction
// between two of the rules above rather than a new failure mode: round (4)
// had explicitly established, for THIS claim's own upcoding theory, that
// "documentation was incomplete and fuller records would justify the
// billed code" is a valid reversal category. Round (5)/(6)'s "don't
// contradict an already-established fact in this claim's own record"
// wording — written for a different claim, with linked-claim corroboration
// in mind — was never scoped to exclude the claim's OWN self-reported
// documentation, so the judge reasonably (and destructively) applied it to
// strike down the exact category round (4) had already ruled valid, on the
// same claim, using materially the same evidence. Two rules, each correct
// for the claim that motivated it, never checked against each other before
// this collided. Fixed by scoping (5)/(6)'s rule explicitly to facts
// independently corroborated from OUTSIDE the claim (a linked claim, a
// network directory) and explicitly excluding the claim's own
// documentation from it — an upcoding theory's premise IS that the
// documentation might not match the code, so treating that same
// documentation as untouchable was always going to contradict round (4).
// Worth remembering going forward: a new rule motivated by one claim needs
// to be checked against the rules that already passed on other claims, not
// just against the claim that prompted it.
// (8) Round (7)'s own fix caused a real regression the very same day,
// caught immediately by scripts/validate-deny-guardrail.ts (built
// specifically because of round (7)'s lesson) rather than another live
// surprise: a phantom-billing claim that had passed cleanly earlier in the
// session — reversal criteria citing a missing encounter note and an
// absent check-in log — now failed, because round (7)'s "independently
// corroborated fact from outside this claim" language wasn't precise about
// WHAT counts as outside. The judge treated the claim's own Pipeline
// evidence bullets (a missing note, an absent log — both just this same
// encounter's own documentation trail) the same as a genuinely separate
// source like a linked claim or a network directory. Fixed by making the
// test explicitly about SOURCE rather than fraud-theory type: a fact from
// a different, independently-submitted claim or an independently-maintained
// reference is untouchable; a fact that's just this same claim's own
// documentation of this same encounter is always gap-fillable, for any
// fraud theory, phantom billing included, not only upcoding.
// (9) A ninth round, same OB/GYN-diagnosis-mismatch claim as round (5)/(6),
// exposed the judge giving directly contradictory guidance on the exact
// same underlying evidence across two different live runs: one run argued
// field 1's two named theories were genuinely separate anomalies each
// needing its own field-4 cure (matching round (5)/(6) below); the next run
// argued the opposite — that the second theory (provider-identity
// misrepresentation) was pure speculation riding on the same single signal
// as the first (upcoding), with no independent evidence of its own, and
// field 1 should commit to upcoding alone. On reflection the second run was
// right and round (5)/(6)'s own validation of the "name both" framing for
// THIS claim was too quick: the Fitzgerald/Redwood claim's two theories
// were genuinely separate because a linked claim gave independent evidence
// specifically for the identity theory; this claim has no such second
// source — "provider identity might be misrepresented" here is just one
// more speculative reading of the same specialty/diagnosis mismatch that
// also generates the upcoding reading, not a separately-evidenced anomaly.
// Point 1 below now makes that test explicit: multiple theories may only be
// named together when each has its OWN independent evidence, not when
// they're just different interpretations of one ambiguous signal.
// (10) After nine rounds of prompt-level patches to field 2 (wrong document,
// fabricated provision, corpus gap, retrieval-recall gap), a step back: field
// 2 was never actually open-ended in the first place. Deny is only ever the
// recommended action for the fraud category, at High Confidence
// (action-lookup.ts's lookupAction — no other category or tier reaches
// Deny), so the correct plan/policy citation is always the exact same fixed
// text, every single time, for every Deny justification this system will
// ever produce. There was never a real reason for either the judge or the
// drafter to independently search for or compose this from scratch — that's
// exactly the kind of thing this codebase already treats as a deterministic
// lookup elsewhere (status, severity, recommended_action itself), just not
// yet applied here. Fixed by interpolating FRAUD_NONPAYMENT_PROVISION
// directly into this shared text as field 2's given, fixed answer — Anchor
// now quotes it directly instead of calling reference_lookup for it, and the
// judge compares against a known-correct passage instead of independently
// deriving what "the" correct citation should be. This doesn't touch field
// 1 or field 4, which genuinely do vary per claim and still require real
// judgment on both sides — this fix only removes generation/verification
// variance from the one field that was never actually variable.
// (11) An eleventh round found the judge rejecting a resubmitted field 1
// that had already been corrected to commit to a single theory (per round
// (9)), on the grounds that "the claim description" used "or" between two
// patterns — but the actual submitted text contained no such hedge at all.
// Root cause: the userMessage shows the claim's own category_detail label
// (a Pipeline-computed preliminary finding, which can itself read like
// "phantom billing or upcoding" as a raw classification, not a committed
// legal theory) alongside the adjuster's own field 1 text, with nothing
// telling the judge these are different things — it conflated the
// background label with the field being graded. DENIAL_SYSTEM_PROMPT now
// says explicitly that the category label is context only, not itself
// subject to field 1's single-theory rule, and that field 1 is graded only
// against what the adjuster actually wrote.

export const DENY_FIELD_REQUIREMENTS = `1. Specific reason(s) for denial — must name the specific fraudulent pattern(s) found in this claim, grounded in the Fraud-Indicator Reference. Name more than one pattern only if each one has its OWN independent evidence supporting it specifically — not when multiple patterns are just different speculative readings of the same single signal (e.g. a specialty/diagnosis mismatch, on its own, can suggest either upcoding or provider-identity misrepresentation, but doesn't independently establish both — that's one ambiguous signal, not two evidenced anomalies). When only one signal exists, commit to its single best-supported reading rather than hedging between what it might mean. Only name multiple theories together when a SEPARATE piece of evidence (e.g. a linked claim's own independently-confirmed facts) specifically supports the additional theory beyond what the first signal alone would suggest — in that case field 4 below must address each one.
2. Plan/policy provision(s) cited — this is NOT open-ended: Deny is only ever the recommended action for the fraud category at High Confidence (see action-lookup.ts — there is no other path to a denial), so the correct provision is always the same fixed text, not something to search for or compose fresh each time:
"${FRAUD_NONPAYMENT_PROVISION}"
Accept the field if it accurately conveys this passage's substance (a close paraphrase is fine); reject it if it cites a different provision, cites the Fraud-Indicator Reference instead (that document defines what a fraud pattern IS, not what plan provision makes it non-payable), adds a fabricated additional provision, or omits the substance above entirely. There is no case where a different citation is correct for this field.
3. Internal rule, clinical protocol, or medical-necessity standard applied — if one applies, name it explicitly as a specific standard or protocol; state "None" if it genuinely doesn't. Describing the underlying clinical facts without ever identifying them as coming from a named standard does not satisfy this field.
4. What may reverse the decision — name the specific category of evidence that would show THIS claim, as originally submitted, was actually correct and should be paid. That category must be logically consistent with EVERY fraud theory named in field 1, not just one of several if field 1 named more than one — evidence that only cures one alternative (e.g. proving the service happened, when field 1 also alleged the wrong provider billed it) leaves the other theory unaddressed and does not qualify. Never rely on the billing provider's own credentials to cure a theory that the service was never performed or was performed by someone else entirely.

A reversal category is allowed to show that the original theory itself doesn't hold — that is what a reversal fundamentally is, not a disqualifying contradiction. This applies generally, not just to any one fraud pattern: when field 1 names multiple theories that are really alternative explanations of ONE underlying anomaly (e.g. "upcoding OR phantom billing" for one billing discrepancy, or "phantom billing OR misrepresentation of who performed it" for one provider-identity anomaly), a single category of evidence that resolves the anomaly in favor of legitimacy validly addresses all of them at once — naming that alongside a corrective path (a corrected claim/code) is not hedging, since only one will turn out to apply once real evidence comes in.

What decides whether a fact can be contested is its SOURCE, not which fraud theory it's attached to. Two different sources, two different rules:
- A fact from a genuinely separate source — a different, independently-submitted claim (e.g. a linked facility claim's own confirmed location/date/NPI), or an authoritative reference maintained independently of this specific encounter (e.g. a network directory's own provider record) — cannot be contradicted. "The theory might be wrong" is a genuine gap a reversal can fill; "a fact from a separate, independent source would have to be wrong instead" is not a gap, and is never a valid reversal category.
- A fact that's just this SAME claim's own documentation of this SAME encounter — clinical notes, remarks fields, a check-in log, an absent encounter note, the billed code itself — is always gap-fillable, regardless of which fraud theory it's supporting. This is true for upcoding/undercoding (the documentation might not have captured the full clinical picture) exactly as much as it's true for phantom billing (an encounter note or check-in record might simply be missing from the file, not proof the visit never happened) — the theory being alleged doesn't change that this is still just this encounter's own paperwork, which can always turn out to be incomplete.

A corrected or resubmitted claim under different billing information is NOT a reversal of this claim's denial — it describes a different, separately-adjudicated claim, not evidence that this one was actually correct. Only offer a "corrected claim" as reversal material for a genuine data/clerical error (a wrong digit, a transposed field) where the correction would make THIS submission right. Once independent evidence already on file (not just an internal inconsistency in this claim's own numbers) corroborates that the claim as submitted misrepresented who performed the service or that it happened at all, there is usually no remaining path that reverses THIS claim — say so plainly rather than reaching for a resubmission path that isn't actually a reversal.

State "No information could reverse this decision" whenever that is genuinely true given the specific fraud theory (or theories) actually alleged and the strength of the corroborating evidence — this is often the correct answer once independent record evidence, not just suspicion, already confirms the theory, not a fallback for failing to find something better.`;
