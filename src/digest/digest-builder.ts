/**
 * Digest Builder
 * Generates structured Markdown and JSON daily digest summaries grouped by NextStepOwner
 */

import { PREvaluationResult } from '../evaluator/types';
import {
  DailyDigest,
  OwnerDigestGroup,
  DigestOutput,
  DigestBuilderOptions,
} from './types';

const DEFAULT_OPTIONS: DigestBuilderOptions = {
  maxTopPriorities: 10,
  includeStaleThreshold: 7, // days
  includeCiBlocked: true,
};

/**
 * DigestBuilder
 * Generates daily digest summaries from PREvaluationResult outputs
 */
export class DigestBuilder {
  private options: DigestBuilderOptions;

  constructor(options: DigestBuilderOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Build a complete daily digest from evaluation results
   */
  buildDigest(results: PREvaluationResult[]): DailyDigest {
    if (results.length === 0) {
      return this.createEmptyDigest();
    }

    // Group PRs by owner
    const ownerGroups = this.groupByOwner(results);

    // Calculate state breakdown
    const stateBreakdown = this.calculateStateBreakdown(results);

    // Get top priority PRs
    const topPriorities = this.getTopPriorityPRs(
      results,
      this.options.maxTopPriorities || 10
    );

    // Get stale PRs (branch_staleness_days > threshold)
    const stalePRs = results.filter(
      (r) => r.pr_metadata.branch_staleness_days > this.options.includeStaleThreshold!
    );

    // Get CI blocked PRs
    const ciBlockedPRs = results.filter((r) => r.state === 'CI_BLOCKED');

    return {
      generated_at: new Date().toISOString(),
      total_prs: results.length,
      state_breakdown: stateBreakdown,
      owner_groups: ownerGroups,
      top_priorities: topPriorities,
      stale_prs: stalePRs,
      ci_blocked_prs: ciBlockedPRs,
    };
  }

  /**
   * Group evaluation results by NextStepOwner
   */
  private groupByOwner(results: PREvaluationResult[]): OwnerDigestGroup[] {
    const groups: Record<string, PREvaluationResult[]> = {
      Author: [],
      Reviewer: [],
      Maintainer: [],
    };

    // Group results
    results.forEach((result) => {
      const owner = result.actionable_assignment.owner;
      if (owner in groups) {
        groups[owner as keyof typeof groups].push(result);
      } else {
        // Fallback to Reviewer for unknown owners
        groups.Reviewer.push(result);
      }
    });

    // Sort each group by priority (descending)
    (Object.keys(groups) as Array<keyof typeof groups>).forEach((owner) => {
      groups[owner].sort((a, b) => {
        const priorityDiff =
          b.actionable_assignment.priority - a.actionable_assignment.priority;
        if (priorityDiff !== 0) return priorityDiff;
        // Secondary sort by actionability score (descending)
        return b.actionability_score - a.actionability_score;
      });
    });

    // Convert to OwnerDigestGroup format
    return (Object.keys(groups) as Array<'Author' | 'Reviewer' | 'Maintainer'>).map((owner) => {
      const prs = groups[owner];
      const scores = prs.map((r) => r.actionability_score);
      const avgScore =
        scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : 0;

      return {
        owner,
        prs,
        totalPrs: prs.length,
        avgActionabilityScore: Math.round(avgScore * 100) / 100,
        maxPriority: prs.length > 0 ? Math.max(...prs.map((p) => p.actionable_assignment.priority)) : 0,
      };
    });
  }

  /**
   * Calculate breakdown of PRs by state
   */
  private calculateStateBreakdown(
    results: PREvaluationResult[]
  ): Record<string, number> {
    const breakdown: Record<string, number> = {};

    results.forEach((result) => {
      const state = result.state;
      breakdown[state] = (breakdown[state] || 0) + 1;
    });

    return breakdown;
  }

  /**
   * Get top priority PRs sorted by priority and actionability score
   */
  private getTopPriorityPRs(
    results: PREvaluationResult[],
    limit: number
  ): PREvaluationResult[] {
    const sorted = [...results].sort((a, b) => {
      const priorityDiff =
        b.actionable_assignment.priority - a.actionable_assignment.priority;
      if (priorityDiff !== 0) return priorityDiff;
      return b.actionability_score - a.actionability_score;
    });

    return sorted.slice(0, limit);
  }

  /**
   * Create empty digest for no PRs case
   */
  private createEmptyDigest(): DailyDigest {
    return {
      generated_at: new Date().toISOString(),
      total_prs: 0,
      state_breakdown: {},
      owner_groups: [],
      top_priorities: [],
      stale_prs: [],
      ci_blocked_prs: [],
    };
  }

  /**
   * Generate Markdown summary
   */
  generateMarkdown(digest: DailyDigest): string {
    const lines: string[] = [];

    // Header
    lines.push(`# PR Pulse Daily Digest`);
    lines.push(`Generated: ${new Date(digest.generated_at).toLocaleString()}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`**Total PRs Evaluated:** ${digest.total_prs}`);
    lines.push('');

    // State Breakdown
    lines.push('## State Breakdown');
    Object.entries(digest.state_breakdown).forEach(([state, count]) => {
      lines.push(`- ${state}: ${count}`);
    });
    lines.push('');

    // Owner Groups
    lines.push('## Review Assignments by Owner');
    digest.owner_groups.forEach((group) => {
      lines.push(`### ${group.owner}s (${group.totalPrs} PRs)`);
      if (group.totalPrs === 0) {
        lines.push('  *No PRs assigned*');
      } else {
        lines.push(
          `  **Avg Actionability Score:** ${group.avgActionabilityScore}`
        );
        lines.push(
          `  **Max Priority:** ${group.maxPriority}/5`
        );
        lines.push('');
        group.prs.forEach((pr) => {
          const priorityBadge = '⭐'.repeat(pr.actionable_assignment.priority);
          lines.push(
            `  - ${priorityBadge} [${pr.pr_metadata.pr_id}] ${pr.pr_metadata.repo}: ${pr.actionable_assignment.action} (${pr.actionability_score})`
          );
        });
      }
      lines.push('');
    });

    // Top Priorities
    lines.push('## 🔥 Top Priority PRs');
    if (digest.top_priorities.length === 0) {
      lines.push('*No high-priority PRs*');
    } else {
      digest.top_priorities.forEach((pr, index) => {
        const priorityBadge = '⭐'.repeat(pr.actionable_assignment.priority);
        lines.push(
          `${index + 1}. ${priorityBadge} [${pr.pr_metadata.pr_id}] ${pr.pr_metadata.repo} - ${pr.state} (${pr.actionability_score})`
        );
      });
    }
    lines.push('');

    // Stale PRs
    lines.push('## 🦴 Stale PRs');
    if (digest.stale_prs.length === 0) {
      lines.push('*No stale PRs*');
    } else {
      digest.stale_prs.forEach((pr) => {
        lines.push(
          `  - ${pr.pr_metadata.pr_id}: ${pr.pr_metadata.repo} (${pr.pr_metadata.branch_staleness_days} days stale)`
        );
      });
    }
    lines.push('');

    // CI Blocked
    lines.push('## ❌ CI Blocked PRs');
    if (digest.ci_blocked_prs.length === 0) {
      lines.push('*No CI blocked PRs*');
    } else {
      digest.ci_blocked_prs.forEach((pr) => {
        lines.push(
          `  - ${pr.pr_metadata.pr_id}: ${pr.pr_metadata.repo} (Score: ${pr.actionability_score})`
        );
      });
    }

    return lines.join('\n');
  }

  /**
   * Generate JSON summary
   */
  generateJSON(digest: DailyDigest): string {
    return JSON.stringify(digest, null, 2);
  }

  /**
   * Build and return both Markdown and JSON outputs
   */
  buildDigestOutput(results: PREvaluationResult[]): DigestOutput {
    const digest = this.buildDigest(results);
    return {
      markdown: this.generateMarkdown(digest),
      json: this.generateJSON(digest),
    };
  }
}
