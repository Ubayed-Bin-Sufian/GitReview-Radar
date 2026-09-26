import { mapPull, shouldSkipEvaluation } from '../../src/github/map-pr';

describe('mapPull', () => {
  it('maps a GitHub pull into PR metadata', () => {
    const mapped = mapPull(
      'acme/app',
      {
        number: 12,
        title: 'Fix login',
        html_url: 'https://github.com/acme/app/pull/12',
        user: { login: 'ada' },
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        additions: 10,
        deletions: 4,
        head: { sha: 'abc' },
      },
      [{ state: 'CHANGES_REQUESTED', user: { login: 'bea' }, submitted_at: '2026-09-01T00:00:00Z' }],
      { state: 'failure' }
    );

    expect(mapped.metadata).toMatchObject({
      pr_id: '12',
      repo: 'acme/app',
      author: 'ada',
      diff_size: 14,
      review_status: 'CHANGES_REQUESTED',
      ci_build_state: 'FAILED',
    });
    expect(mapped.metadata.branch_staleness_days).toBeGreaterThanOrEqual(2);
    expect(mapped.head_sha).toBe('abc');
  });
});

describe('shouldSkipEvaluation', () => {
  it('skips Jev when the head SHA and a stored state are unchanged', () => {
    expect(shouldSkipEvaluation('abc', 'CI_BLOCKED', 'abc')).toBe(true);
    expect(shouldSkipEvaluation('abc', 'CI_BLOCKED', 'def')).toBe(false);
    expect(shouldSkipEvaluation('abc', null, 'abc')).toBe(false);
  });
});
