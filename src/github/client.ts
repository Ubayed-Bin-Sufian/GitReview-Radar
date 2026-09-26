export class GithubClient {
  constructor(private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pr-pulse',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub ${response.status} for ${path}`);
    }
    return response.json() as Promise<T>;
  }
}
