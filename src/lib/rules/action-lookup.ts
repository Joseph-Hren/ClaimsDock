// Category + confidence-tier → recommended action — project-spec.txt Section
// 7c. Deterministic lookup, not a model decision — the model (Call 2)
// supplies the confidence tier and the category comes from Call 1; this
// function just applies the fixed table both draw from.

export type Category = 'fraud' | 'ambiguous' | 'missing-data' | 'complex-math' | 'clean';
export type ConfidenceTier = 'High Confidence' | 'Confident' | 'Suspected' | 'Uncertain';
export type RecommendedAction = 'Approve' | 'Approve as calculated' | 'Escalate' | 'Deny' | 'Request Additional Info';

export function lookupAction(params: {
  category: Category;
  confidence?: ConfidenceTier;
  missingFieldIsMaterial?: boolean;
}): RecommendedAction {
  switch (params.category) {
    case 'fraud': {
      if (!params.confidence) throw new Error('lookupAction: confidence is required for the fraud category');
      // High Confidence -> Deny. Confident/Suspected/Uncertain -> Escalate.
      // Never Approve, regardless of tier.
      return params.confidence === 'High Confidence' ? 'Deny' : 'Escalate';
    }
    case 'ambiguous':
      // Always Escalate — genuine ambiguity can't be resolved by the system itself.
      return 'Escalate';
    case 'missing-data':
      if (params.missingFieldIsMaterial === undefined) {
        throw new Error('lookupAction: missingFieldIsMaterial is required for the missing-data category');
      }
      return params.missingFieldIsMaterial ? 'Request Additional Info' : 'Approve';
    case 'complex-math':
      // A calculation problem, not a decision problem — no confidence tag needed.
      return 'Approve as calculated';
    case 'clean':
      return 'Approve';
  }
}
