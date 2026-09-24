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

// Jev Request/Response
export interface JevRequest {
  model?: string;
  messages: Array<{
    role: 'user' | 'system';
    content: string;
  }>;
  questions: JevQuestion[];
}

export interface JevResponse {
  choices?: Record<string, string>;
  scores?: Record<string, number>;
  nouls?: Record<string, boolean>;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
