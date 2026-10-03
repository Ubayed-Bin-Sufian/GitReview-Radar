/**
 * Type definitions for PR-Pulse Jev decision engine
 */

// PR Input Types
export interface PRMetadata {
  pr_id: string;
  repo: string;
  author: string;
  diff_size: number;
  review_status: ReviewStatus;
  ci_build_state: CIState;
  branch_staleness_days: number;
}

export type ReviewStatus = 'APPROVED' | 'CHANGES_REQUESTED' | 'PENDING';
export type CIState = 'SUCCESS' | 'FAILED' | 'PENDING' | 'ERROR';

// Jev Question Types
export interface JevChoiceQuestion {
  type: 'choice';
  name: string;
  description: string;
  choices: string[];
}

export interface JevScoreQuestion {
  type: 'score';
  name: string;
  description: string;
  min: number;
  max: number;
}

export interface JevNoulQuestion {
  type: 'noul';
  name: string;
  description: string;
}

// Union type for questions
export type JevQuestion =
  | { type: 'choice'; choice: JevChoiceQuestion }
  | { type: 'score'; score: JevScoreQuestion }
  | { type: 'noul'; noul: JevNoulQuestion };

// Decision Engine Output
export interface DecisionResult {
  state: PRState;
  actionability_score: number;
  evaluated_rules: string[];
  confidence?: number;
}

export type PRState = 'NEEDS_AUTHOR_FIX' | 'READY_FOR_FINAL_MERGE' | 'STALE_BRANCH' | 'CI_BLOCKED';

// Validation
export function validatePRMetadata(input: unknown): PRMetadata {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Input must be a valid object');
  }

  const requiredFields: (keyof PRMetadata)[] = [
    'pr_id', 'repo', 'author', 'diff_size', 
    'review_status', 'ci_build_state', 'branch_staleness_days'
  ];

  for (const field of requiredFields) {
    if (!(field in input)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  const pr = input as PRMetadata;

  if (typeof pr.pr_id !== 'string' || pr.pr_id.length === 0) {
    throw new Error('pr_id must be a non-empty string');
  }

  if (typeof pr.repo !== 'string' || pr.repo.length === 0) {
    throw new Error('repo must be a non-empty string');
  }

  if (typeof pr.diff_size !== 'number' || pr.diff_size < 0) {
    throw new Error('diff_size must be a non-negative integer');
  }

  if (!['APPROVED', 'CHANGES_REQUESTED', 'PENDING'].includes(pr.review_status)) {
    throw new Error('Invalid review_status value');
  }

  if (!['SUCCESS', 'FAILED', 'PENDING', 'ERROR'].includes(pr.ci_build_state)) {
    throw new Error('Invalid ci_build_state value');
  }

  if (typeof pr.branch_staleness_days !== 'number' || pr.branch_staleness_days < 0) {
    throw new Error('branch_staleness_days must be a non-negative integer');
  }

  return pr;
}

// Jev Request/Response
export interface JevRequest {
  state: string;
  model: string;
  // Questions are sent as a map keyed by your chosen id; answers are returned under the same keys.
  questions: Record<string, any>;
}

export interface JevResponse {
  model?: string;
  answers?: Record<
    string,
    | { type: 'choice'; choice: string; probabilities?: Record<string, number>; confidence?: number }
    | { type: 'score'; score: number; legend?: Record<string, string>; probabilities?: Record<string, number>; confidence?: number }
    | { type: 'noul'; noul: boolean; probabilities?: Record<string, number>; confidence?: number }
  >;
}