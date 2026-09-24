/**
 * Type definitions for PR Evaluator
 */

import { DecisionResult, PRMetadata, PRState } from '../jev/types';

// Next-Step Owner Assignments
export type NextStepOwner = 'Author' | 'Reviewer' | 'Maintainer';

// Actionable assignment with owner and action
export interface ActionableAssignment {
  owner: NextStepOwner;
  action: string;
  priority: number; // 1-5 scale
}

// Complete evaluation result
export interface PREvaluationResult extends DecisionResult {
  pr_metadata: PRMetadata;
  actionable_assignment: ActionableAssignment;
  assigned_at: string; // ISO8601 timestamp
}

// Owner assignment rules
export interface OwnerAssignmentRule {
  state: PRState;
  owner: NextStepOwner;
  action: string;
  priority: number;
}
