import { CIState, PRMetadata, ReviewStatus } from '../jev/types';

export interface GithubReview {
  state: string;
  user?: { login?: string };
  submitted_at?: string;
}

export interface GithubStatus {
  state?: string;
}

export interface GithubPullDetail {
  number: number;
  title: string;
  html_url?: string;
  user?: { login?: string };
  updated_at: string;
  additions?: number;
  deletions?: number;
  head?: { sha?: string };
  base?: { ref?: string };
}

export interface MappedPull {
  github_number: number;
  title: string;
  author: string;
  html_url: string | null;
  head_sha: string;
  metadata: PRMetadata;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function mapReviewStatus(reviews: GithubReview[]): ReviewStatus {
  const latestByUser = new Map<string, GithubReview>();
  const ordered = [...reviews].sort((a, b) => {
    return (a.submitted_at || '').localeCompare(b.submitted_at || '');
  });

  for (const review of ordered) {
    const login = review.user?.login || 'unknown';
    if (review.state === 'COMMENTED') {
      continue;
    }
    latestByUser.set(login, review);
  }

  const states = [...latestByUser.values()].map((review) => review.state);
  if (states.includes('CHANGES_REQUESTED')) {
    return 'CHANGES_REQUESTED';
  }
  if (states.includes('APPROVED')) {
    return 'APPROVED';
  }
  return 'PENDING';
}

export function mapCiState(status: GithubStatus | null): CIState {
  switch (status?.state) {
    case 'failure':
      return 'FAILED';
    case 'error':
      return 'ERROR';
    case 'success':
      return 'SUCCESS';
    default:
      return 'PENDING';
  }
}

export function stalenessDays(updatedAt: string, now = Date.now()): number {
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(updated)) {
    return 0;
  }
  return Math.max(0, Math.floor((now - updated) / DAY_MS));
}

export function mapPull(repo: string, pull: GithubPullDetail, reviews: GithubReview[], status: GithubStatus | null): MappedPull {
  const author = pull.user?.login || 'unknown';
  const diffSize = (pull.additions || 0) + (pull.deletions || 0);
  return {
    github_number: pull.number,
    title: pull.title,
    author,
    html_url: pull.html_url || null,
    head_sha: pull.head?.sha || '',
    metadata: {
      pr_id: String(pull.number),
      repo,
      author,
      diff_size: diffSize,
      review_status: mapReviewStatus(reviews),
      ci_build_state: mapCiState(status),
      branch_staleness_days: stalenessDays(pull.updated_at),
    },
  };
}

export function shouldSkipEvaluation(storedSha: string | null | undefined, storedState: string | null | undefined, nextSha: string): boolean {
  return Boolean(storedSha && storedState && storedSha === nextSha);
}
