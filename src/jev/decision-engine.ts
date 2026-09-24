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
const DEFAULT_MODEL = 'jev-1';

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
    const questions = this.buildQuestions(pr);
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(pr);

    const request: JevRequest = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      questions,
    };

    const response = await this.executeRequest(request);

    return this.parseResponse(response, pr);
  }

  /**
   * Build parallel Jev questions for the PR evaluation
   */
  private buildQuestions(pr: PRMetadata): JevQuestion[] {
    const choiceQuestion: JevChoiceQuestion = {
      type: 'choice',
      name: 'action_state',
      description: 'Determine the appropriate action state for this PR',
      choices: [
        'NEEDS_AUTHOR_FIX',
        'READY_FOR_FINAL_MERGE',
        'STALE_BRANCH',
        'CI_BLOCKED',
      ],
    };

    const scoreQuestion: JevScoreQuestion = {
      type: 'score',
      name: 'actionability_score',
      description: 'Calculate the actionability score (0-100) indicating urgency',
      min: 0,
      max: 100,
    };

    // Noul questions for rule verification
    const noulQuestions: JevNoulQuestion[] = [
      {
        type: 'noul',
        name: 'ci_failed_check',
        description: 'Check if CI build state is FAILED',
      },
      {
        type: 'noul',
        name: 'changes_requested_check',
        description: 'Check if review status is CHANGES_REQUESTED',
      },
      {
        type: 'noul',
        name: 'stale_branch_check',
        description: 'Check if branch is stale (days > 7)',
      },
    ];

    return [
      { type: 'choice', choice: choiceQuestion },
      { type: 'score', score: scoreQuestion },
      ...noulQuestions.map(noul => ({ type: 'noul', noul } as const)),
    ];
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
    const state = response.choices?.action_state as PRState;
    const score = response.scores?.actionability_score ?? this.calculateScore(pr, state);
    const evaluatedRules = this.determineEvaluatedRules(pr, state);

    return {
      state,
      actionability_score: score,
      evaluated_rules: evaluatedRules,
      confidence: response.choices?.action_state ? 0.95 : undefined,
    };
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
