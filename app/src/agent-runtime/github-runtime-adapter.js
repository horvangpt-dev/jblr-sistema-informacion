'use strict';

class GitHubRuntimeAdapter {
  constructor({
    repo = process.env.JBLR_GITHUB_REPO || 'horvangpt-dev/jblr-sistema-informacion',
    token = process.env.JBLR_GITHUB_READ_TOKEN || null,
  } = {}) {
    this.repo = repo;
    this.token = token;
  }

  isConfigured() { return Boolean(this.token); }

  headers() {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jblr-autonomous-runtime-v1',
    };
  }

  async readBranch(branch) {
    if (!this.isConfigured()) return { mode: 'DEGRADED_NO_GITHUB_TOKEN', branch, sha: null };
    const response = await fetch(`https://api.github.com/repos/${this.repo}/branches/${encodeURIComponent(branch)}`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`GitHub branch read failed: ${response.status}`);
    const body = await response.json();
    return { mode: 'READ_ONLY', branch: body.name, sha: body.commit?.sha || null };
  }

  async write() {
    const error = new Error('GitHub runtime adapter is read-only by policy');
    error.code = 'GITHUB_RUNTIME_WRITE_PROHIBITED';
    throw error;
  }
}

module.exports = { GitHubRuntimeAdapter };
