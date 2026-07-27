import { describe, it, expect } from 'vitest';
import { baseSeverityBand, computeSeverity } from './severity';

describe('baseSeverityBand', () => {
  it('bands by dollar amount per Section 7b', () => {
    expect(baseSeverityBand(499)).toBe('Low');
    expect(baseSeverityBand(500)).toBe('Moderate');
    expect(baseSeverityBand(4999)).toBe('Moderate');
    expect(baseSeverityBand(5000)).toBe('High');
    expect(baseSeverityBand(25000)).toBe('High');
    expect(baseSeverityBand(25001)).toBe('Critical');
  });
});

describe('computeSeverity', () => {
  it('stays at the base band when >=50% of the SLA window remains', () => {
    const band = computeSeverity({ billedAmount: 200, disputedMedicalNecessity: false, slaPercentRemaining: 0.75 });
    expect(band).toBe('Low');
  });

  it('escalates exactly one tier between 25% and 50% remaining', () => {
    expect(computeSeverity({ billedAmount: 200, disputedMedicalNecessity: false, slaPercentRemaining: 0.4 })).toBe('Moderate');
    expect(computeSeverity({ billedAmount: 600, disputedMedicalNecessity: false, slaPercentRemaining: 0.4 })).toBe('High');
    expect(computeSeverity({ billedAmount: 6000, disputedMedicalNecessity: false, slaPercentRemaining: 0.4 })).toBe('Critical');
  });

  it('escalates to at least High under 25% remaining', () => {
    expect(computeSeverity({ billedAmount: 200, disputedMedicalNecessity: false, slaPercentRemaining: 0.1 })).toBe('High');
    expect(computeSeverity({ billedAmount: 600, disputedMedicalNecessity: false, slaPercentRemaining: 0.1 })).toBe('High');
  });

  it('escalates to Critical under 25% remaining if already High', () => {
    expect(computeSeverity({ billedAmount: 6000, disputedMedicalNecessity: false, slaPercentRemaining: 0.1 })).toBe('Critical');
  });

  it('forces Critical outright once the deadline is breached, overriding dollar amount', () => {
    expect(computeSeverity({ billedAmount: 50, disputedMedicalNecessity: false, slaPercentRemaining: -0.01 })).toBe('Critical');
  });

  it('bumps disputed medical necessity to at least High regardless of dollar amount', () => {
    expect(computeSeverity({ billedAmount: 50, disputedMedicalNecessity: true, slaPercentRemaining: 0.9 })).toBe('High');
  });

  it('does not downgrade an already-higher band when medical necessity is disputed', () => {
    expect(computeSeverity({ billedAmount: 30000, disputedMedicalNecessity: true, slaPercentRemaining: 0.9 })).toBe('Critical');
  });
});
