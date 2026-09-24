/**
 * Unit tests for PREvaluator
 */

import { PREvaluator } from '../../src/evaluator/pr-evaluator';
import { DecisionEngine } from '../../src/jev';
import { PRMetadata } from '../../src/jev/types';
import {
  PREvaluationResult,
  ActionableAssignment,
  NextStepOwner,
} from '../../src/evaluator/types';

// Mock JevDecisionEngine
const mockDecisionEngine = {
  evaluate: jest.fn(),
} as any;

describe('PREvaluator', () => {
  let evaluator: PREvaluator;

  beforeEach(() => {
    evaluator = new PREvaluator(mockDecisionEngine);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluatePR', () => {
    const basePR: PRMetadata = {
      pr_id: '123',
      repo: 'test-repo',
      author: 'test-user',
      diff_size: 100,
      review_status: 'APPROVED',
      ci_build_state: 'SUCCESS',
      branch_staleness_days: 2,
    };

    it('should map CI_BLOCKED to Maintainer with priority 5', async () => {
      mockDecisionEngine.evaluate.mockResolvedValueOnce({
        state: 'CI_BLOCKED',
        actionability_score: 95,
        evaluated_rules: ['R-1'],
        confidence: 0.95,
      });

      const result = await evaluator.evaluatePR(basePR);

      expect(result.state).toBe('CI_BLOCKED');
      expect(result.actionability_score).toBe(95);
      expect(result.actionable_assignment.owner).toBe('Maintainer');
      expect(result.actionable_assignment.action).toBe('Address failing CI checks immediately');
      expect(result.actionable_assignment.priority).toBe(5);
      expect(result.assigned_at).toBeDefined();
      expect(result.pr_metadata).toEqual(basePR);
    });

    it('should map NEEDS_AUTHOR_FIX to Author with priority 4', async () => {
      mockDecisionEngine.evaluate.mockResolvedValueOnce({
        state: 'NEEDS_AUTHOR_FIX',
        actionability_score: 85,
        evaluated_rules: ['R-2'],
        confidence: 0.95,
      });

      const result = await evaluator.evaluatePR(basePR);

      expect(result.state).toBe('NEEDS_AUTHOR_FIX');
      expect(result.actionable_assignment.owner).toBe('Author');
      expect(result.actionable_assignment.action).toBe('Address review feedback and update PR');
      expect(result.actionable_assignment.priority).toBe(4);
    });

    it('should map STALE_BRANCH to Author with priority 3', async () => {
      mockDecisionEngine.evaluate.mockResolvedValueOnce({
        state: 'STALE_BRANCH',
        actionability_score: 70,
        evaluated_rules: ['R-3'],
        confidence: 0.95,
      });

      const result = await evaluator.evaluatePR(basePR);

      expect(result.state).toBe('STALE_BRANCH');
      expect(result.actionable_assignment.owner).toBe('Author');
      expect(result.actionable_assignment.action).toBe('Rebase or merge with latest main branch');
      expect(result.actionable_assignment.priority).toBe(3);
    });

    it('should map READY_FOR_FINAL_MERGE to Maintainer with priority 2', async () => {
      mockDecisionEngine.evaluate.mockResolvedValueOnce({
        state: 'READY_FOR_FINAL_MERGE',
        actionability_score: 50,
        evaluated_rules: ['R-4'],
        confidence: 0.95,
      });

      const result = await evaluator.evaluatePR(basePR);

      expect(result.state).toBe('READY_FOR_FINAL_MERGE');
      expect(result.actionable_assignment.owner).toBe('Maintainer');
      expect(result.actionable_assignment.action).toBe('Merge to main branch');
      expect(result.actionable_assignment.priority).toBe(2);
    });

    it('should handle unknown state with Reviewer fallback', async () => {
      mockDecisionEngine.evaluate.mockResolvedValueOnce({
        state: 'UNKNOWN_STATE' as any,
        actionability_score: 50,
        evaluated_rules: [],
        confidence: 0.95,
      });

      const result = await evaluator.evaluatePR(basePR);

      expect(result.actionable_assignment.owner).toBe('Reviewer');
      expect(result.actionable_assignment.action).toBe('Re-evaluate PR state');
      expect(result.actionable_assignment.priority).toBe(1);
    });
  });

  describe('assignOwner', () => {
    it('should assign Maintainer for CI_BLOCKED', () => {
      const assignment = evaluator.assignOwner('CI_BLOCKED');
      expect(assignment.owner).toBe('Maintainer');
      expect(assignment.priority).toBe(5);
    });

    it('should assign Author for NEEDS_AUTHOR_FIX', () => {
      const assignment = evaluator.assignOwner('NEEDS_AUTHOR_FIX');
      expect(assignment.owner).toBe('Author');
      expect(assignment.priority).toBe(4);
    });

    it('should assign Author for STALE_BRANCH', () => {
      const assignment = evaluator.assignOwner('STALE_BRANCH');
      expect(assignment.owner).toBe('Author');
      expect(assignment.priority).toBe(3);
    });

    it('should assign Maintainer for READY_FOR_FINAL_MERGE', () => {
      const assignment = evaluator.assignOwner('READY_FOR_FINAL_MERGE');
      expect(assignment.owner).toBe('Maintainer');
      expect(assignment.priority).toBe(2);
    });

    it('should return fallback for unknown state', () => {
      const assignment = evaluator.assignOwner('UNKNOWN_STATE' as any);
      expect(assignment.owner).toBe('Reviewer');
      expect(assignment.priority).toBe(1);
    });
  });

  describe('calculateOverallPriority', () => {
    it('should calculate combined priority correctly', () => {
      // actionabilityScore = 100 (max), ownerPriority = 5 (max)
      // combined = (100/100 * 0.7) + (5/5 * 0.3) = 1.0 -> rounded * 5 = 5
      expect(evaluator.calculateOverallPriority(100, 5)).toBe(5);

      // actionabilityScore = 0 (min), ownerPriority = 1 (min)
      // combined = (0/100 * 0.7) + (1/5 * 0.3) = 0.06 -> rounded = 0.3
      expect(evaluator.calculateOverallPriority(0, 1)).toBe(0);

      // actionabilityScore = 50, ownerPriority = 3
      // combined = (50/100 * 0.7) + (3/5 * 0.3) = 0.35 + 0.18 = 0.53 -> rounded = 3
      expect(evaluator.calculateOverallPriority(50, 3)).toBe(3);
    });
  });

  describe('getOwnerRules and setOwnerRules', () => {
    it('should return default owner rules', () => {
      const rules = evaluator.getOwnerRules();
      expect(rules).toHaveLength(4);
      expect(rules[0].state).toBe('CI_BLOCKED');
      expect(rules[0].owner).toBe('Maintainer');
      expect(rules[0].priority).toBe(5);
    });

    it('should allow updating owner rules', () => {
      const customRules = [
        {
          state: 'CI_BLOCKED' as const,
          owner: 'Reviewer' as NextStepOwner,
          action: 'Custom action',
          priority: 3,
        },
      ];
      evaluator.setOwnerRules(customRules);
      const rules = evaluator.getOwnerRules();
      expect(rules).toEqual(customRules);
    });
  });

  describe('evaluateBatch', () => {
    const prs: PRMetadata[] = [
      {
        pr_id: '123',
        repo: 'test-repo',
        author: 'user1',
        diff_size: 50,
        review_status: 'APPROVED',
        ci_build_state: 'SUCCESS',
        branch_staleness_days: 1,
      },
      {
        pr_id: '124',
        repo: 'test-repo',
        author: 'user2',
        diff_size: 200,
        review_status: 'CHANGES_REQUESTED',
        ci_build_state: 'PENDING',
        branch_staleness_days: 5,
      },
      {
        pr_id: '125',
        repo: 'test-repo',
        author: 'user3',
        diff_size: 100,
        review_status: 'APPROVED',
        ci_build_state: 'FAILED',
        branch_staleness_days: 2,
      },
    ];

    it('should evaluate multiple PRs in parallel', async () => {
      mockDecisionEngine.evaluate
        .mockResolvedValueOnce({
          state: 'READY_FOR_FINAL_MERGE',
          actionability_score: 50,
          evaluated_rules: ['R-4'],
        })
        .mockResolvedValueOnce({
          state: 'NEEDS_AUTHOR_FIX',
          actionability_score: 85,
          evaluated_rules: ['R-2'],
        })
        .mockResolvedValueOnce({
          state: 'CI_BLOCKED',
          actionability_score: 95,
          evaluated_rules: ['R-1'],
        });

      const results = await evaluator.evaluateBatch(prs);

      expect(results).toHaveLength(3);
      expect(results[0].state).toBe('READY_FOR_FINAL_MERGE');
      expect(results[1].state).toBe('NEEDS_AUTHOR_FIX');
      expect(results[2].state).toBe('CI_BLOCKED');
      expect(mockDecisionEngine.evaluate).toHaveBeenCalledTimes(3);
    });
  });
});
