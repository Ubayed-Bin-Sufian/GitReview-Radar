import { GithubClient } from '../github/client';
import { GithubPullDetail, GithubReview, GithubStatus, mapPull, shouldSkipEvaluation } from '../github/map-pr';
import { DecisionEngine } from '../jev/decision-engine';
import { PREvaluator } from '../evaluator/pr-evaluator';

export interface StoredPull {
  github_number: number;
  head_sha: string | null;
  action_state: string | null;
  actionability_score: number | null;
  next_step_owner: string | null;
}

export interface SyncedPullRow {
  github_number: number;
  title: string;
  author: string;
  html_url: string | null;
  state: string;
  diff_size: number;
  review_status: string;
  ci_build_state: string;
  branch_staleness_days: number;
  head_sha: string;
  action_state: string | null;
  actionability_score: number | null;
  next_step_owner: string | null;
  evaluated_at: string | null;
  skipped_jev: boolean;
}

export interface SyncedIssueRow {
  github_number: number;
  title: string;
  author: string;
  state: string;
  html_url: string | null;
  updated_at: string | null;
}

interface IssueItem {
  number: number;
  title: string;
  state: string;
  html_url?: string;
  updated_at?: string;
  user?: { login?: string };
  pull_request?: unknown;
}

export async function syncRepository(input: {
  owner: string;
  name: string;
  token: string;
  jevApiKey: string;
  stored: StoredPull[];
  github?: GithubClient;
}): Promise<{ pulls: SyncedPullRow[]; issues: SyncedIssueRow[] }> {
  const github = input.github || new GithubClient(input.token);
  const repo = `${input.owner}/${input.name}`;
  const listed = await github.getJson<GithubPullDetail[]>(`/repos/${repo}/pulls?state=open&per_page=30`);
  const storedByNumber = new Map(input.stored.map((row) => [row.github_number, row]));
  const evaluator = input.jevApiKey ? new PREvaluator(new DecisionEngine(input.jevApiKey)) : null;
  const pulls: SyncedPullRow[] = [];

  for (const summary of listed) {
    const detail = await github.getJson<GithubPullDetail>(`/repos/${repo}/pulls/${summary.number}`);
    const reviews = await github.getJson<GithubReview[]>(`/repos/${repo}/pulls/${summary.number}/reviews`);
    const sha = detail.head?.sha || '';
    const status = sha
      ? await github.getJson<GithubStatus>(`/repos/${repo}/commits/${sha}/status`)
      : null;
    const mapped = mapPull(repo, detail, reviews, status);
    const previous = storedByNumber.get(mapped.github_number);
    const skip = shouldSkipEvaluation(previous?.head_sha, previous?.action_state, mapped.head_sha);

    let actionState = previous?.action_state || null;
    let score = previous?.actionability_score ?? null;
    let owner = previous?.next_step_owner || null;
    let evaluatedAt: string | null = null;

    if (!skip && evaluator) {
      const result = await evaluator.evaluatePR(mapped.metadata);
      actionState = result.state;
      score = result.actionability_score;
      owner = result.actionable_assignment.owner;
      evaluatedAt = result.assigned_at;
    }

    pulls.push({
      github_number: mapped.github_number,
      title: mapped.title,
      author: mapped.author,
      html_url: mapped.html_url,
      state: 'open',
      diff_size: mapped.metadata.diff_size,
      review_status: mapped.metadata.review_status,
      ci_build_state: mapped.metadata.ci_build_state,
      branch_staleness_days: mapped.metadata.branch_staleness_days,
      head_sha: mapped.head_sha,
      action_state: actionState,
      actionability_score: score,
      next_step_owner: owner,
      evaluated_at: evaluatedAt,
      skipped_jev: skip,
    });
  }

  const issueItems = await github.getJson<IssueItem[]>(`/repos/${repo}/issues?state=open&per_page=50`);
  const issues = issueItems
    .filter((item) => !item.pull_request)
    .map((item) => ({
      github_number: item.number,
      title: item.title,
      author: item.user?.login || 'unknown',
      state: item.state,
      html_url: item.html_url || null,
      updated_at: item.updated_at || null,
    }));

  return { pulls, issues };
}
