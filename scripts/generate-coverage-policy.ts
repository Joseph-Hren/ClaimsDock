// Regenerates content/corpora/coverage-policy.md from coverage-constants.ts.
// Run after changing any number in coverage-constants.ts — this file is not
// meant to be hand-edited directly; edits there would be overwritten on the
// next run. Prose/framing below is hand-written; only the numbers are pulled
// from the constants module, so the citable document and the calculation
// layer can never drift apart.

import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  DEDUCTIBLE,
  COVERAGE_CATEGORIES,
  NETWORK,
  CAPS,
  PRIOR_AUTH_TYPICALLY_REQUIRED,
  PRIOR_AUTH_NOT_REQUIRED,
} from '../src/lib/rules/coverage-constants';

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function buildCoverageTable(): string {
  const header = '| Procedure category | Standard coverage (in-network, post-deductible) |\n|---|---|';
  const rows = COVERAGE_CATEGORIES.map((c) => {
    const suffix = c.note ? ` — ${c.note}` : '';
    return `| ${c.label} | ${pct(c.coverage)}${suffix} |`;
  });
  return [header, ...rows].join('\n');
}

const doc = `# Coverage & Adjudication Policy

**Source:** Fully synthetic, written in-house for ClaimsDock. Not sourced from
any real insurer's contract — structurally realistic, invented specifics.
Used by the Evaluation Pipeline's deterministic coverage-math layer and by
Anchor's Reference Lookup and per-claim citations.

*This document is generated from \`src/lib/rules/coverage-constants.ts\` by
\`scripts/generate-coverage-policy.ts\` — the numbers below and the ones the
coverage-math calculation actually uses come from the same source, on
purpose. Do not hand-edit the numbers in this file; edit the constants
module and regenerate instead.*

## Plan Coverage by Procedure Type

${buildCoverageTable()}

## Deductible Logic

- Individual annual deductible: **$${DEDUCTIBLE.individualAnnualLimit}**. Family
  annual deductible: **$${DEDUCTIBLE.familyAnnualLimit}** (met by any
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
- **Out-of-network:** coverage drops to a flat **${pct(NETWORK.outOfNetworkCoverage)}**
  of the plan's allowed amount (not the provider's billed charge, and not a
  discount off the category's usual rate), and the member may be
  balance-billed for the difference between the billed charge and the
  allowed amount.
- **Emergency care exception:** ER visits are covered at the in-network rate
  regardless of the facility's network status — a member having a medical
  emergency cannot reasonably choose an in-network ER.

## Prior-Authorization Requirements by Procedure Type

**Typically requires prior authorization:**
${PRIOR_AUTH_TYPICALLY_REQUIRED.map((item) => `- ${item}`).join('\n')}

**Does not require prior authorization:**
${PRIOR_AUTH_NOT_REQUIRED.map((item) => `- ${item}`).join('\n')}

## Annual and Visit Caps

- Physical/occupational therapy: ${CAPS.therapyVisitsPerPlanYear} visits per
  plan year, combined.
- Inpatient benefit days: ${CAPS.inpatientBenefitDaysPerPlanYear} days per
  plan year at full coverage; days beyond that are covered at a reduced
  per-diem rate rather than a hard cutoff, so a multi-day stay can cross this
  cap partway through — another mid-claim coverage-math scenario, not a
  judgment call.
`;

const outPath = join(__dirname, '..', 'content', 'corpora', 'coverage-policy.md');
writeFileSync(outPath, doc, 'utf8');
console.log(`Generated ${outPath}`);
