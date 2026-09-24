/**
 * Rule R-2: Needs Author Fix Rule
 * If review status is CHANGES_REQUESTED (and CI not FAILED), state = NEEDS_AUTHOR_FIX
 */

import { PRMetadata, PRState } from '../types';

export class NeedsAuthorFixRule {
  private readonly name = 'R-2';
  private readonly description = 'Review Status Rule';

  /**
   * Check if the rule applies to the given PR
   */
  applies(pr: PRMetadata): boolean {
    return pr.review_status === 'CHANGES_REQUESTED';
  }

  /**
   * Get the rule name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get the rule description
   */
  getDescription(): string {
    return this.description;
  }

  /**
   * Determine the PR state when this rule applies
   */
  getState(): PRState {
    return 'NEEDS_AUTHOR_FIX';
  }

  /**
   * Calculate the actionability score when this rule applies
   */
  calculateScore(pr: PRMetadata): number {
    const baseScore = 85 + pr.diff_size / 200;
    return Math.min(Math.round(baseScore), 100);
  }
}
