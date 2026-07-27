import { describe, it, expect } from 'vitest';
import { deriveInitialStatus } from './status';

describe('deriveInitialStatus', () => {
  it('is clean when there is no evidence', () => {
    expect(deriveInitialStatus(0)).toBe('Submitted, no flags');
  });

  it('is flagged when there is any evidence at all', () => {
    expect(deriveInitialStatus(1)).toBe('Submitted, flagged');
    expect(deriveInitialStatus(5)).toBe('Submitted, flagged');
  });
});
