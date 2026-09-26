import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config';
import { syncRepository } from '../sync/sync-repo';

export async function syncHandler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const config = getConfig();
    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !config.supabaseUrl || !config.supabaseAnonKey) {
      return json(401, { error: { code: 'UNAUTHORIZED', message: 'Sign in and configure Supabase.' } });
    }

    const userClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) {
      return json(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid session.' } });
    }

    const body = JSON.parse(event.body || '{}') as { repo_id?: string };
    if (!body.repo_id) {
      return json(400, { error: { code: 'VALIDATION_ERROR', message: 'repo_id is required' } });
    }

    const { data: repo, error: repoError } = await userClient
      .from('repositories')
      .select('id, owner, name')
      .eq('id', body.repo_id)
      .single();
    if (repoError || !repo) {
      return json(404, { error: { code: 'NOT_FOUND', message: 'Repository not found' } });
    }

    const { data: settings } = await userClient
      .from('user_settings')
      .select('jev_api_key, github_token')
      .eq('user_id', userData.user.id)
      .single();

    if (!settings?.github_token) {
      return json(400, { error: { code: 'VALIDATION_ERROR', message: 'Add a GitHub token in Settings first.' } });
    }

    const { data: stored } = await userClient
      .from('pull_requests')
      .select('github_number, head_sha, action_state, actionability_score, next_step_owner')
      .eq('repo_id', repo.id);

    const result = await syncRepository({
      owner: repo.owner,
      name: repo.name,
      token: settings.github_token,
      jevApiKey: settings.jev_api_key || '',
      stored: stored || [],
    });

    const writer = config.supabaseServiceRoleKey
      ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey)
      : userClient;

    if (result.pulls.length > 0) {
      const { error } = await writer.from('pull_requests').upsert(
        result.pulls.map((pull) => ({
          repo_id: repo.id,
          github_number: pull.github_number,
          title: pull.title,
          author: pull.author,
          html_url: pull.html_url,
          state: pull.state,
          diff_size: pull.diff_size,
          review_status: pull.review_status,
          ci_build_state: pull.ci_build_state,
          branch_staleness_days: pull.branch_staleness_days,
          head_sha: pull.head_sha,
          action_state: pull.action_state,
          actionability_score: pull.actionability_score,
          next_step_owner: pull.next_step_owner,
          evaluated_at: pull.evaluated_at,
        })),
        { onConflict: 'repo_id,github_number' }
      );
      if (error) {
        throw new Error(error.message);
      }
    }

    if (result.issues.length > 0) {
      const { error } = await writer.from('issues').upsert(
        result.issues.map((issue) => ({
          repo_id: repo.id,
          github_number: issue.github_number,
          title: issue.title,
          author: issue.author,
          state: issue.state,
          html_url: issue.html_url,
          updated_at: issue.updated_at,
        })),
        { onConflict: 'repo_id,github_number' }
      );
      if (error) {
        throw new Error(error.message);
      }
    }

    await writer
      .from('repositories')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('id', repo.id);

    return json(200, {
      repo_id: repo.id,
      pull_count: result.pulls.length,
      issue_count: result.issues.length,
      jev_calls: result.pulls.filter((pull) => !pull.skipped_jev && pull.evaluated_at).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed';
    return json(500, { error: { code: 'SYNC_FAILED', message } });
  }
}

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

export const handler = syncHandler;
export default syncHandler;
