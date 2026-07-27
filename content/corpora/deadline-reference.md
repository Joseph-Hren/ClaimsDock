# Regulatory Deadline Reference

**Source:** ERISA claims-procedure regulation (29 CFR 2560.503-1) and state
prompt-pay statute summaries. Verified directly against DOL/EBSA guidance
and the eCFR text, 2026-07-27.

## The Three ERISA Tiers

Federal ERISA rules tier claim-decision deadlines by urgency, not a single
flat number:

| Claim urgency | Deadline | Extension available? |
|---|---|---|
| Urgent / expedited care | 72 hours | None. If the plan lacks sufficient information, it must notify the claimant within 24 hours and allow 48 hours to supply it — but the 72-hour decision deadline itself does not extend. |
| Pre-service (requires a coverage decision before care is rendered) | 15 days | One extension of up to 15 additional days, if the plan notifies the claimant before the original 15-day period expires. |
| Post-service (claim submitted after care was already provided) | 30 days | One extension of up to 30 additional days, under the same before-expiry notice condition. |

Urgent/expedited claims get no extension at all — the tightest tier is also
the least flexible one, which is consistent with what "urgent" is supposed
to mean.

## When the Clock Starts

The deadline clock starts only once a claim is **"clean"** — complete, with
no missing required information. A claim sitting in a missing-information
hold does not accrue toward its deadline; the clock pauses on the date the
plan requests the missing information and resumes the date the claimant (or
provider) supplies it. This is a real, regulatory distinction, not a
ClaimsDock invention — it mirrors ERISA's own separate treatment of the
"decision deadline" versus the "information-request pause."

## State Prompt-Pay Timing

Where a plan is self-funded and federally regulated, ERISA's deadlines above
govern directly. Where a plan is fully-insured, state "prompt pay" statutes
are the operative reference point instead — these typically require payment
within **30–60 days** once a claim is clean, layering on top of (not
replacing) the federal framework. Exact timing varies by state; 30–60 days
is representative, not a single fixed national number.

## Applying This to ClaimsDock's Test Set

All 20 seed claims are inherently post-service — a CMS-1500 or UB-04 bills
for care already rendered, not a prior-authorization request submitted
before treatment. So in practice, only two tiers are in active use:

- **Standard (30 days)** — the default for essentially all claims in this set.
- **Urgent (72 hours)** — assigned when the underlying care itself was
  emergency or inpatient-acute in nature (an ER visit, an ICU-level
  admission) — an approximation of ERISA's real urgent-care standard,
  applied here to retrospective billing rather than its original
  pre-authorization context. A deliberate, acknowledged simplification, not
  presented as strictly regulatory-accurate.

The 15-day pre-service tier is documented above for completeness — Anchor
may be asked about it directly — but isn't expected to apply to any claim in
the actual test set.

## Sources

- 29 CFR 2560.503-1 (ERISA claims-procedure regulation), via eCFR.
- U.S. Department of Labor, Employee Benefits Security Administration —
  *Filing a Claim for Your Health Benefits* guide and related compliance
  assistance publications.
- State prompt-pay statutes — referenced generally; timing summarized as a
  30–60 day representative range rather than any single state's exact figure.
