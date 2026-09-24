/**
 * Type definitions for Digest Builder
 */

import { PREvaluationResult } from '../evaluator/types';

// Owner groups for digest
export interface OwnerDigestGroup {
  owner: 'Author' | 'Reviewer' | 'Maintainer';
  prs: PREvaluationResult[];
  totalPrs: number;
  avgActionabilityScore: number;
  maxPriority: number;
}

// Daily digest summary
export interface DailyDigest {
  generated_at: string;
  total_prs: number;
  state_breakdown: Record<string, number>;
  owner_groups: OwnerDigestGroup[];
  top_priorities: PREvaluationResult[];
  stale_prs: PREvaluationResult[];
  ci_blocked_prs: PREvaluationResult[];
}

// Digest output formats
export interface DigestOutput {
  markdown: string;
  json: string;
}

// Digest builder options
export interface DigestBuilderOptions {
  maxTopPriorities?: number;
  includeStaleThreshold?: number;
  includeCiBlocked?: boolean;
}
