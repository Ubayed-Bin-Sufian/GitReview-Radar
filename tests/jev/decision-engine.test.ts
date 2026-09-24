/**
 * Unit tests for DecisionEngine
 */

import { DecisionEngine } from '../../src/jev';
import { PRMetadata, PRState } from '../../src/jev/types';

// Mock fetch
const mockFetch = jest.fn();

beforeAll(() => {
  global.fetch = mockFetch;
});

describe('DecisionEngine', () => {
  let engine: DecisionEngine;

  beforeEach(() => {
    engine = new DecisionEngine('test-api-key');
  });

  describe('evaluate', () => {
    it('should evaluate a PR with CI failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: { action_state: 'CI_BLOCKED' },
          scores: { actionability_score: 97 },
          nouls: {},
        }),
      });

      const pr: PRMetadata = {
        pr_id: '123',
        repo: 'test-repo',
        author: 'test-user',
        diff_size: 250,
        review_status: 'APPROVED',
        ci_build_state: 'FAILED',
        branch_staleness_days: 2,
      };

      const result = await engine.evaluate(pr);

      expect(result.state).toBe('CI_BLOCKED');
      expect(result.actionability_score).toBe(97);
      expect(result.evaluated_rules).toContain('R-1 (CI_BLOCKED)');
    });

    it('should evaluate a PR with changes requested', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: { action_state: 'NEEDS_AUTHOR_FIX' },
          scores: { actionability_score: 89 },
          nouls: {},
        }),
      });

      const pr: PRMetadata = {
        pr_id: '124',
        repo: 'test-repo',
        author: 'test-user',
        diff_size: 800,
        review_status: 'CHANGES_REQUESTED',
        ci_build_state: 'PENDING',
        branch_staleness_days: 5,
      };

      const result = await engine.evaluate(pr);

      expect(result.state).toBe('NEEDS_AUTHOR_FIX');
      expect(result.actionability_score).toBe(89);
      expect(result.evaluated_rules).toContain('R-2 (NEEDS_AUTHOR_FIX)');
    });

    it('should evaluate a stale branch PR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: { action_state: 'STALE_BRANCH' },
          scores: { actionability_score: 98 },
          nouls: {},
        }),
      });

      const pr: PRMetadata = {
        pr_id: '125',
        repo: 'test-repo',
        author: 'test-user',
        diff_size: 100,
        review_status: 'APPROVED',
        ci_build_state: 'SUCCESS',
        branch_staleness_days: 14,
      };

      const result = await engine.evaluate(pr);

      expect(result.state).toBe('STALE_BRANCH');
      expect(result.actionability_score).toBe(98);
      expect(result.evaluated_rules).toContain('R-3 (STALE_BRANCH)');
    });

    it('should evaluate a ready for merge PR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: { action_state: 'READY_FOR_FINAL_MERGE' },
          scores: { actionability_score: 50 },
          nouls: {},
        }),
      });

      const pr: PRMetadata = {
        pr_id: '126',
        repo: 'test-repo',
        author: 'test-user',
        diff_size: 50,
        review_status: 'APPROVED',
        ci_build_state: 'SUCCESS',
        branch_staleness_days: 3,
      };

      const result = await engine.evaluate(pr);

      expect(result.state).toBe('READY_FOR_FINAL_MERGE');
      expect(result.actionability_score).toBe(50);
      expect(result.evaluated_rules).toContain('R-4 (READY_FOR_FINAL_MERGE)');
    });

    it('should cap scores at 100', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: { action_state: 'CI_BLOCKED' },
          scores: { actionability_score: 100 },
          nouls: {},
        }),
      });

      const pr: PRMetadata = {
        pr_id: '127',
        repo: 'test-repo',
        author: 'test-user',
        diff_size: 5000,
        review_status: 'APPROVED',
        ci_build_state: 'FAILED',
        branch_staleness_days: 2,
      };

      const result = await engine.evaluate(pr);

      expect(result.state).toBe('CI_BLOCKED');
      expect(result.actionability_score).toBe(100);
    });
  });

  describe('calculateScore', () => {
    it('should calculate CI_BLOCKED score correctly', () => {
      const pr = {
        diff_size: 100,
        review_status: 'APPROVED' as const,
        ci_build_state: 'FAILED' as const,
        branch_staleness_days: 2,
        pr_id: '1',
        repo: 'test',
        author: 'user',
      };

      const score = (engine as any).calculateScore(pr, 'CI_BLOCKED');
      // 95 + 100/100 = 96
      expect(score).toBe(96);
    });

    it('should calculate NEEDS_AUTHOR_FIX score correctly', () => {
      const pr = {
        diff_size: 200,
        review_status: 'CHANGES_REQUESTED' as const,
        ci_build_state: 'PENDING' as const,
        branch_staleness_days: 5,
        pr_id: '1',
        repo: 'test',
        author: 'user',
      };

      const score = (engine as any).calculateScore(pr, 'NEEDS_AUTHOR_FIX');
      // 85 + 200/200 = 86
      expect(score).toBe(86);
    });

    it('should calculate STALE_BRANCH score correctly', () => {
      const pr = {
        diff_size: 100,
        review_status: 'APPROVED' as const,
        ci_build_state: 'SUCCESS' as const,
        branch_staleness_days: 10,
        pr_id: '1',
        repo: 'test',
        author: 'user',
      };

      const score = (engine as any).calculateScore(pr, 'STALE_BRANCH');
      // 70 + 10*2 = 90
      expect(score).toBe(90);
    });

    it('should calculate READY_FOR_FINAL_MERGE score correctly', () => {
      const pr = {
        diff_size: 100,
        review_status: 'APPROVED' as const,
        ci_build_state: 'SUCCESS' as const,
        branch_staleness_days: 2,
        pr_id: '1',
        repo: 'test',
        author: 'user',
      };

      const score = (engine as any).calculateScore(pr, 'READY_FOR_FINAL_MERGE');
      // 50 + 100/500 = 50.2, rounded = 50
      expect(score).toBe(50);
    });

    it('should calculate READY_FOR_FINAL_MERGE with PENDING review status', () => {
      const pr = {
        diff_size: 100,
        review_status: 'PENDING' as const,
        ci_build_state: 'SUCCESS' as const,
        branch_staleness_days: 2,
        pr_id: '1',
        repo: 'test',
        author: 'user',
      };

      const score = (engine as any).calculateScore(pr, 'READY_FOR_FINAL_MERGE');
      // 25 + 100/500 = 25.2, rounded = 25
      expect(score).toBe(25);
    });
  });
});
