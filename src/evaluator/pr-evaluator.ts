/**
 * PR Evaluator Service
 * Consumes PR metadata, passes through JevDecisionEngine, and maps output to actionable Next-Step Owner assignments
 */

import { DecisionEngine } from '../jev/decision-engine';
import {
  PRMetadata,
  DecisionResult,
  PRState,
  PRState as JevPRState,
} from '../jev/types';
import {
  ActionableAssignment,
  PREvaluationResult,
  OwnerAssignmentRule,
  NextStepOwner,
} from './types';

// Default owner assignment rules based on PR state
const DEFAULT_OWNER_RULES: OwnerAssignmentRule[] = [
  {
    state: 'CI_BLOCKED',
    owner: 'Maintainer',
    action: 'Address failing CI checks immediately',
    priority: 5,
  },
  {
    state: 'NEEDS_AUTHOR_FIX',
    owner: 'Author',
    action: 'Address review feedback and update PR',
    priority: 4,
  },
  {
    state: 'STALE_BRANCH',
    owner: 'Author',
    action: 'Rebase or merge with latest main branch',
    priority: 3,
  },
  {
    state: 'READY_FOR_FINAL_MERGE',
    owner: 'Maintainer',
    action: 'Merge to main branch',
    priority: 2,
  },
];

/**
 * PREvaluator Service
 * Evaluates PRs and assigns Next-Step Owners
 */
export class PREvaluator {
  private decisionEngine: DecisionEngine;
  private ownerRules: OwnerAssignmentRule[];

  constructor(
    decisionEngine: DecisionEngine,
    ownerRules: OwnerAssignmentRule[] = DEFAULT_OWNER_RULES
  ) {
    this.decisionEngine = decisionEngine;
    this.ownerRules = ownerRules;
  }

  /**
   * Evaluate a PR and return complete evaluation result with Next-Step Owner assignment
   */
  async evaluatePR(pr: PRMetadata): Promise<PREvaluationResult> {
    const decisionResult = await this.decisionEngine.evaluate(pr);
    const actionableAssignment = this.assignOwner(decisionResult.state);

    return {
      ...decisionResult,
      pr_metadata: pr,
      actionable_assignment: actionableAssignment,
      assigned_at: new Date().toISOString(),
    };
  }

  /**
   * Assign Next-Step Owner based on PR state
   */
  assignOwner(state: JevPRState): ActionableAssignment {
    const rule = this.ownerRules.find(r => r.state === state);

    if (!rule) {
      // Fallback rule
      return {
        owner: 'Reviewer',
        action: 'Re-evaluate PR state',
        priority: 1,
      };
    }

    return {
      owner: rule.owner,
      action: rule.action,
      priority: rule.priority,
    };
  }

  /**
   * Get the current owner assignment rules
   */
  getOwnerRules(): OwnerAssignmentRule[] {
    return this.ownerRules;
  }

  /**
   * Update owner assignment rules
   */
  setOwnerRules(rules: OwnerAssignmentRule[]): void {
    this.ownerRules = rules;
  }

  /**
   * Calculate priority score based on actionability score and owner priority
   */
  calculateOverallPriority(
    actionabilityScore: number,
    ownerPriority: number
  ): number {
    // Weight: actionability score (70%) + owner priority (30%)
    const normalizedActionability = actionabilityScore / 100;
    const normalizedOwner = ownerPriority / 5;

    const combined =
      normalizedActionability * 0.7 + normalizedOwner * 0.3;

    return Math.round(combined * 5); // Scale back to 1-5
  }

  /**
   * Process multiple PRs in batch
   */
  async evaluateBatch(prs: PRMetadata[]): Promise<PREvaluationResult[]> {
    return Promise.all(prs.map(pr => this.evaluatePR(pr)));
  }
}
