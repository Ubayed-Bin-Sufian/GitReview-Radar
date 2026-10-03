/**
 * TypeSafe Jev Decision Engine Wrapper
 * Uses standard fetch against TypeSafe AI's Jev endpoint
 */

import {
  PRMetadata,
  JevRequest,
  JevResponse,
  JevChoiceQuestion,
  JevScoreQuestion,
  JevNoulQuestion,
  JevQuestion,
  DecisionResult,
  PRState,
} from './types';

// Jev endpoint configuration
const JEV_ENDPOINT = 'https://api.typesafe.ai/jev/v1/chat/completions';

// Default model to use
// TypeSafe docs use aliases like `jev-latest`. Using a non-existent model will return 400 Unknown model.
const DEFAULT_MODEL = 'jev-latest';

/**
 * TypeSafe Jev Decision Engine
 * Accepts PR metadata and constructs parallel Choice, Score, and Noul questions
 */
export class DecisionEngine {
  private apiKey: string;
  private endpoint: string;
  private model: string;

  constructor(
    apiKey: string = process.env.JEV_API_KEY || '',
    endpoint: string = JEV_ENDPOINT,
    model: string = DEFAULT_MODEL
  ) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.model = model;

    if (!this.apiKey) {
      console.warn('JEV_API_KEY not set. Decision engine will fail without API key.');
    }
  }

  /**
   * Evaluate a PR using Jev decision primitives
   * Constructs parallel questions for:
   * - Choice: Action state (NEEDS_AUTHOR_FIX, READY_FOR_FINAL_MERGE, STALE_BRANCH, CI_BLOCKED)
   * - Score: Actionability score (0-100)
   * - Noul: Boolean checks for rule verification
   */
  async evaluate(pr: PRMetadata): Promise<DecisionResult> {
    const userPrompt = this.buildUserPrompt(pr);
    const questions = this.buildQuestionsMap(pr);

    const request: JevRequest = {
      model: this.model,
      state: userPrompt,
      questions,
    };

    const response = await this.executeRequest(request);

    return this.parseResponse(response, pr);
  }

  /**
   * Build parallel Jev questions for the PR evaluation (SystemOne request shape)
   */
  private buildQuestionsMap(pr: PRMetadata): Record<string, any> {
    const actionState = {
      type: 'choice',
      instructions: 'Choose exactly one action_state.',
      criteria: {
        NEEDS_AUTHOR_FIX: 'Changes requested: author must update PR',
        READY_FOR_FINAL_MERGE: 'Ready to merge: approved, not stale, no CI failure',
        STALE_BRANCH: 'Branch is stale (> 7 days)',
        CI_BLOCKED: 'CI is failing (FAILED)',
      },
    };

    const actionabilityScore = {
      type: 'score',
      instructions: 'Score how urgently this PR needs attention (0-100).',
      criteria: ['0', '25', '50', '75', '100'],
    };

    const ciFailedCheck = {
      type: 'noul',
      instructions: 'Is ci_build_state equal to FAILED?',
      criteria: {
        true: 'ci_build_state is FAILED',
        false: 'ci_build_state is not FAILED',
      },
    };

    const changesRequestedCheck = {
      type: 'noul',
      instructions: 'Is review_status equal to CHANGES_REQUESTED?',
      criteria: {
        true: 'review_status is CHANGES_REQUESTED',
        false: 'review_status is not CHANGES_REQUESTED',
      },
    };

    const staleBranchCheck = {
      type: 'noul',
      instructions: 'Is branch_staleness_days greater than 7?',
      criteria: {
        true: 'branch_staleness_days > 7',
        false: 'branch_staleness_days <= 7',
      },
    };

    // Keys must match how we parse answers in parseResponse()
    return {
      action_state: actionState,
      actionability_score: actionabilityScore,
      ci_failed_check: ciFailedCheck,
      changes_requested_check: changesRequestedCheck,
      stale_branch_check: staleBranchCheck,
    };
  }

  /**
   * Build the system prompt for Jev
   */
  private buildSystemPrompt(): string {
    return `You are a PR evaluation assistant. Your task is to analyze pull request metadata and determine:
1. The appropriate action state for the PR
2. An actionability score (0-100) indicating how urgently attention is needed
3. Boolean checks for rule conditions

Follow these decision rules:
- R-1: If CI build state is FAILED, state = CI_BLOCKED, score >= 95
- R-2: If review status is CHANGES_REQUESTED (and CI not FAILED), state = NEEDS_AUTHOR_FIX
- R-3: If branch is stale (>7 days, and no CI failure, no changes requested), state = STALE_BRANCH
- R-4: Otherwise, state = READY_FOR_FINAL_MERGE

Score calculations:
- CI_BLOCKED: 95 + (diff_size / 100), capped at 100
- NEEDS_AUTHOR_FIX: 85 + (diff_size / 200), capped at 100
- STALE_BRANCH: 70 + (branch_staleness_days * 2), capped at 100
- READY_FOR_FINAL_MERGE: (review_status == APPROVED ? 50 : 25) + (diff_size / 500), capped at 100`;
  }

  /**
   * Build the user prompt with PR metadata
   */
  private buildUserPrompt(pr: PRMetadata): string {
    return `Please evaluate the following PR metadata:

PR ID: ${pr.pr_id}
Repository: ${pr.repo}
Author: ${pr.author}
Diff Size: ${pr.diff_size} lines
Review Status: ${pr.review_status}
CI Build State: ${pr.ci_build_state}
Branch Staleness: ${pr.branch_staleness_days} days

Provide your evaluation as JSON with action_state, actionability_score, and the boolean checks.`;
  }

  /**
   * Execute the Jev request
   */
  private async executeRequest(request: JevRequest): Promise<JevResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jev API error: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<JevResponse>;
  }

  /**
   * Parse the Jev response into a DecisionResult
   */
  private parseResponse(response: JevResponse, pr: PRMetadata): DecisionResult {
    // Support both:
    // 1) New SystemOne shape: response.answers.{...}
    // 2) Legacy test/mock shape: response.choices / response.scores
    const legacyChoices = (response as any).choices as undefined | Record<string, string>;
    const legacyScores = (response as any).scores as undefined | Record<string, number>;

    const actionStateAnswer = response.answers?.action_state;
    const stateFromAnswers =
      actionStateAnswer && actionStateAnswer.type === 'choice'
        ? (actionStateAnswer.choice as PRState)
        : undefined;

    const stateFromLegacy = legacyChoices?.action_state as PRState | undefined;

    const state = (stateFromAnswers || stateFromLegacy || this.calculateFallbackState(pr)) as PRState;

    const scoreFromAnswers = (() => {
      const scoreAnswer = response.answers?.actionability_score;
      if (scoreAnswer && scoreAnswer.type === 'score' && typeof (scoreAnswer as any).score === 'number') {
        return Math.min(Math.max(Math.round((scoreAnswer as any).score), 0), 100);
      }
      return undefined;
    })();

    const scoreFromLegacy = typeof legacyScores?.actionability_score === 'number'
      ? Math.min(Math.max(Math.round(legacyScores.actionability_score), 0), 100)
      : undefined;

    const score = scoreFromAnswers ?? scoreFromLegacy ?? this.calculateScore(pr, state);

    const evaluatedRules = this.determineEvaluatedRules(pr, state);

    return {
      state,
      actionability_score: score,
      evaluated_rules: evaluatedRules,
      confidence: actionStateAnswer ? 0.95 : undefined,
    };
  }

  private calculateFallbackState(pr: PRMetadata): PRState {
    if (pr.ci_build_state === 'FAILED') return 'CI_BLOCKED';
    if (pr.review_status === 'CHANGES_REQUESTED') return 'NEEDS_AUTHOR_FIX';
    if (pr.branch_staleness_days > 7) return 'STALE_BRANCH';
    return 'READY_FOR_FINAL_MERGE';
  }

  /**
   * Calculate score based on PR metadata and state (fallback when Jev score is not available)
   */
  private calculateScore(pr: PRMetadata, state: PRState): number {
    let baseScore: number;

    switch (state) {
      case 'CI_BLOCKED':
        baseScore = 95 + pr.diff_size / 100;
        break;
      case 'NEEDS_AUTHOR_FIX':
        baseScore = 85 + pr.diff_size / 200;
        break;
      case 'STALE_BRANCH':
        baseScore = 70 + pr.branch_staleness_days * 2;
        break;
      case 'READY_FOR_FINAL_MERGE':
        const reviewBonus = pr.review_status === 'APPROVED' ? 50 : 25;
        baseScore = reviewBonus + pr.diff_size / 500;
        break;
      default:
        baseScore = 50;
    }

    return Math.min(Math.max(Math.round(baseScore), 0), 100);
  }

  /**
   * Determine which rules were applied based on PR metadata
   */
  private determineEvaluatedRules(pr: PRMetadata, state: PRState): string[] {
    const rules: string[] = [];

    if (pr.ci_build_state === 'FAILED') {
      rules.push('R-1 (CI_BLOCKED)');
    } else if (pr.review_status === 'CHANGES_REQUESTED') {
      rules.push('R-2 (NEEDS_AUTHOR_FIX)');
    } else if (pr.branch_staleness_days > 7) {
      rules.push('R-3 (STALE_BRANCH)');
    } else {
      rules.push('R-4 (READY_FOR_FINAL_MERGE)');
    }

    return rules;
  }
}
