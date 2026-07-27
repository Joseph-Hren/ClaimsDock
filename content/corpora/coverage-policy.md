# Coverage & Adjudication Policy

**Source:** Fully synthetic, written in-house for ClaimsDock. Not sourced from
any real insurer's contract — structurally realistic, invented specifics.
Used by the Evaluation Pipeline's deterministic coverage-math layer and by
Anchor's Reference Lookup and per-claim citations.

## Plan Coverage by Procedure Type

| Procedure category | Standard coverage (in-network, post-deductible) |
|---|---|
| Preventive care (screenings, annual wellness visit) | 100% — deductible waived |
| Primary care / specialist office visits | 90% |
| Outpatient procedures and same-day surgery | 80% |
| Inpatient facility stays | 80% |
| Emergency department visits | 80% — deductible applies, but network status does not (see below) |
| Physical / occupational therapy | 80%, up to 30 visits per plan year |
| Durable medical equipment (DME) | 70% |
| Mental health and substance use services | 90% — parity with primary care, per plan design |

## Deductible Logic

- Individual annual deductible: **$500**. Family annual deductible: **$1,500**
  (met by any combination of family members' spend).
- Coverage percentages above apply **after** the deductible is met. Charges
  applied toward an unmet deductible are the member's responsibility in full,
  up to the remaining deductible balance.
- A single claim can cross the deductible threshold mid-claim — when the
  member's cumulative spend for the plan year passes $500 (individual) or
  $1,500 (family) partway through a multi-line claim, coverage percentage
  applies only to the portion of charges past that threshold. This is a
  calculation, not a judgment call — see project-spec.txt Section 6.
- Deductible resets at the start of each plan year (calendar year).

## In-Network vs. Out-of-Network Rates

- **In-network:** standard coverage percentages above apply; the provider's
  contracted rate is the billable amount (no balance billing to the member
  beyond standard cost-sharing).
- **Out-of-network:** coverage drops to **60%** of the plan's allowed amount
  (not the provider's billed charge), and the member may be balance-billed
  for the difference between the billed charge and the allowed amount.
- **Emergency care exception:** ER visits are covered at the in-network rate
  (80%) regardless of the facility's network status — a member having a
  medical emergency cannot reasonably choose an in-network ER.

## Prior-Authorization Requirements by Procedure Type

**Typically requires prior authorization:**
- Inpatient elective admissions
- Advanced imaging (MRI, CT, PET)
- Durable medical equipment over $500
- Major-joint injections and certain injectable/infusion therapies, *depending
  on the specific plan* — this is a genuine source of coverage-applicability
  ambiguity (see the Ambiguous category in project-spec.txt Section 7c), since
  whether a given plan requires it isn't always resolvable from the claim alone

**Does not require prior authorization:**
- Routine primary care and specialist office visits
- Emergency department visits (by definition — emergencies cannot be
  pre-authorized)
- Preventive screenings
- Physical/occupational therapy within the standard visit allowance

## Annual and Visit Caps

- Physical/occupational therapy: 30 visits per plan year, combined.
- Inpatient benefit days: 60 days per plan year at full coverage; days beyond
  60 are covered at a reduced per-diem rate rather than a hard cutoff, so a
  multi-day stay can cross this cap partway through — another mid-claim
  coverage-math scenario, not a judgment call.
