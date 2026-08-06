# Coverage & Adjudication Policy

## Plan Coverage by Procedure Type

| Procedure category | Standard coverage (in-network, post-deductible) |
|---|---|
| Preventive care (screenings, annual wellness visit) | 100% — deductible waived |
| Primary care / specialist office visits | 90% |
| Outpatient procedures and same-day surgery | 80% |
| Inpatient facility stays | 80% |
| Emergency department visits | 80% — deductible applies, but network status does not |
| Physical / occupational therapy | 80% — up to 30 visits per plan year |
| Durable medical equipment (DME) | 70% |
| Mental health and substance use services | 90% — parity with primary care, per plan design |

## Deductible Logic

- Individual annual deductible: **$500**. Family
  annual deductible: **$1500** (met by any
  combination of family members' spend).
- Coverage percentages above apply **after** the deductible is met. Charges
  applied toward an unmet deductible are the member's responsibility in full,
  up to the remaining deductible balance.
- A single claim can cross the deductible threshold mid-claim — when the
  member's cumulative spend for the plan year passes the deductible limit
  partway through a multi-line claim, coverage percentage applies only to the
  portion of charges past that threshold. This is a calculation, not a
  judgment call — see project-spec.txt Section 6.
- Deductible resets at the start of each plan year (calendar year).

## In-Network vs. Out-of-Network Rates

- **In-network:** standard coverage percentages above apply; the provider's
  contracted rate is the billable amount (no balance billing to the member
  beyond standard cost-sharing).
- **Out-of-network:** coverage drops to a flat **60%**
  of the plan's allowed amount (not the provider's billed charge, and not a
  discount off the category's usual rate), and the member may be
  balance-billed for the difference between the billed charge and the
  allowed amount.
- **Emergency care exception:** ER visits are covered at the in-network rate
  regardless of the facility's network status — a member having a medical
  emergency cannot reasonably choose an in-network ER.

## Prior-Authorization Requirements by Procedure Type

**Typically requires prior authorization:**
- Inpatient elective admissions
- Advanced imaging (MRI, CT, PET)
- Durable medical equipment over $500
- Major-joint injections and certain injectable/infusion therapies (plan-dependent — a genuine coverage-applicability ambiguity, not always resolvable from the claim alone)

**Does not require prior authorization:**
- Routine primary care and specialist office visits
- Emergency department visits (by definition — emergencies cannot be pre-authorized)
- Preventive screenings
- Physical/occupational therapy within the standard visit allowance

## Annual and Visit Caps

- Physical/occupational therapy: 30 visits per
  plan year, combined.
- Inpatient benefit days: 60 days per
  plan year at full coverage; days beyond that are covered at
  50% of the normal rate rather than a hard
  cutoff, so a multi-day stay can cross this cap partway through — another
  mid-claim coverage-math scenario, not a judgment call.

## Fraud, Misrepresentation, and Non-Payable Claims

- Benefits are not payable for any claim or portion of a claim involving fraud, intentional misrepresentation, or abusive billing practices — including, but not limited to, phantom billing, upcoding, unbundling, double billing, and billing for medically unnecessary or substandard care (see the Fraud-Indicator Reference for the recognized typology). This applies regardless of whether the claim would otherwise satisfy standard coverage criteria, network status, or prior-authorization requirements described elsewhere in this policy — a claim exhibiting one or more of these patterns is non-payable on that basis alone.
