/**
 * EventBridge daily digest. Uses stored scores. Does not call Jev.
 * Sends only through connectors the user has enabled.
 */

import { EventBridgeEvent } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config';
import { DigestBuilder } from '../digest';
import { dispatchEnabled } from '../connectors';
import { PREvaluationResult } from '../evaluator/types';
import { PRState } from '../jev/types';

interface PullRow {
  title: string;
  author: string;
  github_number: number;
  diff_size: number;
  review_status: string;
  ci_build_state: string;
  branch_staleness_days: number;
  action_state: string;
  actionability_score: number;
  next_step_owner: string;
  evaluated_at: string | null;
  repositories: { user_id: string; owner: string; name: string } | { user_id: string; owner: string; name: string }[];
}

export async function digestHandler(
  _event: EventBridgeEvent<'ScheduledEvent', void>
): Promise<void> {
  const config = getConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    console.log('Supabase service role is not configured. Skipping digest.');
    return;
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
  const { data: connectors, error } = await supabase
    .from('connectors')
    .select('user_id, plugin_id, enabled, config')
    .eq('enabled', true);

  if (error) {
    throw new Error(error.message);
  }
  if (!connectors || connectors.length === 0) {
    console.log('No enabled connectors.');
    return;
  }

  const builder = new DigestBuilder();
  const byUser = new Map<string, typeof connectors>();
  for (const row of connectors) {
    const list = byUser.get(row.user_id) || [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  for (const [userId, rows] of byUser) {
    const { data: pulls } = await supabase
      .from('pull_requests')
      .select('title, author, github_number, diff_size, review_status, ci_build_state, branch_staleness_days, action_state, actionability_score, next_step_owner, evaluated_at, repositories!inner(user_id, owner, name)')
      .eq('repositories.user_id', userId)
      .not('action_state', 'is', null);

    const results = ((pulls || []) as PullRow[]).map(toEvaluation);
    const output = builder.buildDigestOutput(results);
    const sent = await dispatchEnabled(
      rows.map((row) => ({
        plugin_id: row.plugin_id,
        enabled: row.enabled,
        config: (row.config || {}) as Record<string, string>,
      })),
      output.markdown
    );
    console.log(`Digest for ${userId} sent via ${sent.join(', ') || 'none'}`);
  }
}

function toEvaluation(row: PullRow): PREvaluationResult {
  const repoJoin = Array.isArray(row.repositories) ? row.repositories[0] : row.repositories;
  const owner = (row.next_step_owner || 'Reviewer') as PREvaluationResult['actionable_assignment']['owner'];
  return {
    state: row.action_state as PRState,
    actionability_score: row.actionability_score || 0,
    evaluated_rules: [],
    pr_metadata: {
      pr_id: String(row.github_number),
      repo: `${repoJoin.owner}/${repoJoin.name}`,
      author: row.author,
      diff_size: row.diff_size,
      review_status: row.review_status as PREvaluationResult['pr_metadata']['review_status'],
      ci_build_state: row.ci_build_state as PREvaluationResult['pr_metadata']['ci_build_state'],
      branch_staleness_days: row.branch_staleness_days,
    },
    actionable_assignment: {
      owner,
      action: row.title,
      priority: owner === 'Maintainer' ? 5 : 3,
    },
    assigned_at: row.evaluated_at || new Date().toISOString(),
  };
}

export const handler = digestHandler;
export default digestHandler;
