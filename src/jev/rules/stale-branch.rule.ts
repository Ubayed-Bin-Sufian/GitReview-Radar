/**
 * Rule R-3: Stale Branch Rule
 * If branch is stale (>7 days, and no CI failure, no changes requested), state = STALE_BRANCH
 */

import { PRMetadata, PRState } from '../types';

export class StaleBranchRule {
  private readonly name = 'R-3';
  private readonly description = 'Branch Staleness Rule';

  /**
   * Check if the rule applies to the given PR
   */
  applies(pr: PRMetadata): boolean {
    return pr.branch_staleness_days > 7;
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
    return 'STALE_BRANCH';
  }

  /**
   * Calculate the actionability score when this rule applies
   */
  calculateScore(pr: PRMetadata): number {
    const baseScore = 70 + pr.branch_staleness_days * 2;
    return Math.min(Math.round(baseScore), 100);
  }
}
