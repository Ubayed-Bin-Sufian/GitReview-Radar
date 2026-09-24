/**
 * Rule R-4: Ready for Merge Rule
 * Otherwise (no CI failure, no changes requested, not stale), state = READY_FOR_FINAL_MERGE
 */

import { PRMetadata, PRState } from '../types';

export class ReadyForMergeRule {
  private readonly name = 'R-4';
  private readonly description = 'Ready for Final Merge Rule';

  /**
   * Check if the rule applies to the given PR
   */
  applies(pr: PRMetadata): boolean {
    return true;
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
    return 'READY_FOR_FINAL_MERGE';
  }

  /**
   * Calculate the actionability score when this rule applies
   */
  calculateScore(pr: PRMetadata): number {
    const reviewBonus = pr.review_status === 'APPROVED' ? 50 : 25;
    const baseScore = reviewBonus + pr.diff_size / 500;
    return Math.min(Math.round(baseScore), 100);
  }
}
