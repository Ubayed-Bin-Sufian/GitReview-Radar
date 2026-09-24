/**
 * Unit tests for DigestBuilder
 */

import { DigestBuilder } from '../../src/digest/digest-builder';
import { DailyDigest, DigestOutput } from '../../src/digest/types';
import { PREvaluationResult, ActionableAssignment } from '../../src/evaluator/types';
import { PRMetadata } from '../../src/jev/types';

// Mock PRMetadata
const createMockMetadata = (overrides: Partial<PRMetadata> = {}): PRMetadata => ({
  pr_id: '123',
  repo: 'test-repo',
  author: 'test-user',
  diff_size: 100,
  review_status: 'APPROVED' as const,
  ci_build_state: 'SUCCESS' as const,
  branch_staleness_days: 2,
  ...overrides,
});

// Mock ActionableAssignment
const createMockAssignment = (overrides: Partial<ActionableAssignment> = {}): ActionableAssignment => ({
  owner: 'Maintainer' as const,
  action: 'Merge to main branch',
  priority: 2,
  ...overrides,
});

// Mock PREvaluationResult
const createMockResult = (overrides: Partial<PREvaluationResult> = {}): PREvaluationResult => ({
  pr_metadata: createMockMetadata(),
  state: 'READY_FOR_FINAL_MERGE' as const,
  actionability_score: 50,
  evaluated_rules: ['R-4'] as const,
  actionable_assignment: createMockAssignment(),
  assigned_at: new Date().toISOString(),
  ...overrides,
});

describe('DigestBuilder', () => {
  let builder: DigestBuilder;

  beforeEach(() => {
    builder = new DigestBuilder();
  });

  describe('buildDigest', () => {
    it('should return empty digest for empty results', () => {
      const digest = builder.buildDigest([]);

      expect(digest).toMatchObject({
        total_prs: 0,
        generated_at: expect.any(String),
        state_breakdown: {},
        owner_groups: [],
        top_priorities: [],
        stale_prs: [],
        ci_blocked_prs: [],
      });
    });

    it('should group PRs by owner', () => {
      const results: PREvaluationResult[] = [
        createMockResult({
          actionable_assignment: { owner: 'Maintainer', action: 'Merge', priority: 2 },
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '124' }),
          actionable_assignment: { owner: 'Author', action: 'Update PR', priority: 4 },
          state: 'NEEDS_AUTHOR_FIX',
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '125' }),
          actionable_assignment: { owner: 'Maintainer', action: 'Merge', priority: 2 },
          state: 'READY_FOR_FINAL_MERGE',
        }),
      ];

      const digest = builder.buildDigest(results);

      expect(digest.owner_groups).toHaveLength(3);
      const maintainerGroup = digest.owner_groups.find(g => g.owner === 'Maintainer');
      expect(maintainerGroup?.totalPrs).toBe(2);
      const authorGroup = digest.owner_groups.find(g => g.owner === 'Author');
      expect(authorGroup?.totalPrs).toBe(1);
    });

    it('should calculate state breakdown', () => {
      const results: PREvaluationResult[] = [
        createMockResult({ state: 'READY_FOR_FINAL_MERGE' }),
        createMockResult({ state: 'CI_BLOCKED' }),
        createMockResult({ state: 'CI_BLOCKED' }),
        createMockResult({ state: 'NEEDS_AUTHOR_FIX' }),
      ];

      const digest = builder.buildDigest(results);

      expect(digest.state_breakdown).toEqual({
        READY_FOR_FINAL_MERGE: 1,
        CI_BLOCKED: 2,
        NEEDS_AUTHOR_FIX: 1,
      });
    });

    it('should calculate average actionability score per owner', () => {
      const results: PREvaluationResult[] = [
        createMockResult({
          actionable_assignment: { owner: 'Maintainer', action: 'Merge', priority: 2 },
          actionability_score: 50,
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '124' }),
          actionable_assignment: { owner: 'Maintainer', action: 'Merge', priority: 2 },
          actionability_score: 70,
        }),
      ];

      const digest = builder.buildDigest(results);

      const maintainerGroup = digest.owner_groups.find(g => g.owner === 'Maintainer');
      expect(maintainerGroup?.avgActionabilityScore).toBe(60);
    });

    it('should sort PRs by priority within owner groups', () => {
      const results: PREvaluationResult[] = [
        createMockResult({
          actionable_assignment: { owner: 'Maintainer', action: 'Merge', priority: 2 },
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '124' }),
          actionable_assignment: { owner: 'Maintainer', action: 'Merge', priority: 5 },
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '125' }),
          actionable_assignment: { owner: 'Maintainer', action: 'Merge', priority: 3 },
        }),
      ];

      const digest = builder.buildDigest(results);

      const maintainerGroup = digest.owner_groups.find(g => g.owner === 'Maintainer');
      if (maintainerGroup) {
        expect(maintainerGroup.prs[0].actionable_assignment.priority).toBe(5);
        expect(maintainerGroup.prs[1].actionable_assignment.priority).toBe(3);
        expect(maintainerGroup.prs[2].actionable_assignment.priority).toBe(2);
      }
    });

    it('should identify stale PRs', () => {
      const results: PREvaluationResult[] = [
        createMockResult({ pr_metadata: createMockMetadata({ branch_staleness_days: 5 }) }),
        createMockResult({ pr_metadata: createMockMetadata({ branch_staleness_days: 8 }) }),
        createMockResult({ pr_metadata: createMockMetadata({ branch_staleness_days: 14 }) }),
      ];

      const digest = builder.buildDigest(results);

      expect(digest.stale_prs).toHaveLength(2);
      expect(digest.stale_prs.map(p => p.pr_metadata.branch_staleness_days)).toEqual([8, 14]);
    });

    it('should identify CI blocked PRs', () => {
      const results: PREvaluationResult[] = [
        createMockResult({ state: 'CI_BLOCKED' }),
        createMockResult({ state: 'READY_FOR_FINAL_MERGE' }),
        createMockResult({ state: 'CI_BLOCKED' }),
      ];

      const digest = builder.buildDigest(results);

      expect(digest.ci_blocked_prs).toHaveLength(2);
    });

    it('should get top priority PRs', () => {
      const results: PREvaluationResult[] = [
        createMockResult({ actionable_assignment: { priority: 2, owner: 'Maintainer', action: 'Merge' } }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '124' }),
          actionable_assignment: { priority: 5, owner: 'Maintainer', action: 'Merge' },
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '125' }),
          actionable_assignment: { priority: 3, owner: 'Maintainer', action: 'Merge' },
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '126' }),
          actionable_assignment: { priority: 4, owner: 'Maintainer', action: 'Merge' },
        }),
      ];

      const digest = builder.buildDigest(results);

      expect(digest.top_priorities).toHaveLength(4);
      expect(digest.top_priorities.map(p => p.actionable_assignment.priority)).toEqual([5, 4, 3, 2]);
    });

    it('should limit top priority PRs when maxTopPriorities is set', () => {
      const results: PREvaluationResult[] = [
        createMockResult({ actionable_assignment: { priority: 2, owner: 'Maintainer', action: 'Merge' } }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '124' }),
          actionable_assignment: { priority: 5, owner: 'Maintainer', action: 'Merge' },
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '125' }),
          actionable_assignment: { priority: 3, owner: 'Maintainer', action: 'Merge' },
        }),
      ];

      const customBuilder = new DigestBuilder({ maxTopPriorities: 2 });
      const digest = customBuilder.buildDigest(results);

      expect(digest.top_priorities).toHaveLength(2);
      expect(digest.top_priorities.map(p => p.actionable_assignment.priority)).toEqual([5, 3]);
    });
  });

  describe('generateMarkdown', () => {
    let digest: DailyDigest;

    beforeEach(() => {
      const results: PREvaluationResult[] = [
        createMockResult({
          actionable_assignment: { owner: 'Maintainer', action: 'Merge', priority: 5 },
          actionability_score: 95,
        }),
        createMockResult({
          pr_metadata: createMockMetadata({ pr_id: '124' }),
          actionable_assignment: { owner: 'Author', action: 'Update PR', priority: 3 },
          state: 'NEEDS_AUTHOR_FIX',
          actionability_score: 70,
        }),
      ];
      digest = builder.buildDigest(results);
    });

    it('should generate valid Markdown output', () => {
      const markdown = builder.generateMarkdown(digest);

      expect(markdown).toContain('# PR Pulse Daily Digest');
      expect(markdown).toContain('## Summary');
      expect(markdown).toContain('## State Breakdown');
      expect(markdown).toContain('## Review Assignments by Owner');
      expect(markdown).toContain('## 🔥 Top Priority PRs');
      expect(markdown).toContain('## 🦴 Stale PRs');
      expect(markdown).toContain('## ❌ CI Blocked PRs');
    });

    it('should include owner counts in Markdown', () => {
      const markdown = builder.generateMarkdown(digest);

      expect(markdown).toContain('Maintainers (1 PRs)');
      expect(markdown).toContain('Authors (1 PRs)');
    });
  });

  describe('generateJSON', () => {
    it('should generate valid JSON output', () => {
      const results: PREvaluationResult[] = [
        createMockResult(),
        createMockResult({ state: 'CI_BLOCKED', actionability_score: 95 }),
      ];

      const digest = builder.buildDigest(results);
      const json = builder.generateJSON(digest);

      const parsed = JSON.parse(json);
      expect(parsed.total_prs).toBe(2);
      expect(parsed.owner_groups).toHaveLength(3);
      expect(parsed.ci_blocked_prs).toHaveLength(1);
    });
  });

  describe('buildDigestOutput', () => {
    it('should return both markdown and JSON', () => {
      const results: PREvaluationResult[] = [createMockResult()];

      const output: DigestOutput = builder.buildDigestOutput(results);

      expect(output.markdown).toBeDefined();
      expect(output.json).toBeDefined();
      const parsedOutput = JSON.parse(output.json);
      const parsedExpected = JSON.parse(JSON.stringify(builder.buildDigest(results), null, 2));
      // Remove generated_at for comparison since timestamps will differ
      delete parsedOutput.generated_at;
      delete parsedExpected.generated_at;
      expect(parsedOutput).toEqual(parsedExpected);
    });
  });
});
