/**
 * Rule R-1: CI Blocked Rule
 * If CI build state is FAILED, state = CI_BLOCKED, score >= 95
 */

import { PRMetadata, PRState } from '../types';

export class CIBlockedRule {
  private readonly name = 'R-1';
  private readonly description = 'CI Build State Priority Rule';

  /**
   * Check if the rule applies to the given PR
   */
  applies(pr: PRMetadata): boolean {
    return pr.ci_build_state === 'FAILED';
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
    return 'CI_BLOCKED';
  }

  /**
   * Calculate the actionability score when this rule applies
   */
  calculateScore(pr: PRMetadata): number {
    const baseScore = 95 + pr.diff_size / 100;
    return Math.min(Math.round(baseScore), 100);
  }
}
