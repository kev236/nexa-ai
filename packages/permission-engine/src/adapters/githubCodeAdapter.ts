/**
 * Lets Nexa AI look at, and propose a fix to, its own source — through
 * GitHub's REST API only, never local git operations (the deployed app
 * has no writable git working copy to commit from, unlike
 * tools/propose-improvement/run.mjs, a standalone script that runs
 * somewhere with a real checkout and can lint/typecheck/test before
 * opening its PR). Two halves: getFileContent (read, no approval needed
 * — see chat.ts's read_repo_file tool) and proposeChange (branch +
 * commit + PR, always run from inside the propose_code_change executor,
 * which only ever fires after an owner's approval — see
 * proposeCodeChange.ts). proposeChange only ever opens a pull request;
 * it never merges one. Merging is a second, separate, more deliberate
 * action the owner takes on GitHub itself.
 *
 * This path can't pre-verify its own proposal the way the standalone
 * script does (no lint/tsc/test access from inside a Vercel serverless
 * function) — the real backstop here is this repo's own CI
 * (.github/workflows/ci.yml), which runs on every PR regardless of who
 * opened it, catching a broken proposal before the owner ever considers
 * merging it. Worth knowing, not a reason not to ship this: it's the
 * same safety net any human-opened PR in this repo already relies on.
 *
 * Reuses the exact same GITHUB_TOKEN / GITHUB_REPOSITORY env vars
 * tools/propose-improvement already documents, rather than asking for a
 * second credential for what's conceptually the same capability — see
 * that tool's README for the token's required scopes (Contents +
 * Pull requests, Read and write, fine-grained, scoped to this one repo).
 *
 * GitHub's contents/git/pulls REST API is long-stable and well-
 * documented — unlike TikTok's Marketing API, this isn't sourced from
 * cross-checked guides; the endpoint shapes below are the real,
 * current API.
 */

export type GitHubFile = { content: string; sha: string }

export type ProposeChangeInput = {
  path: string
  newContent: string
  commitMessage: string
  branchName: string
  prTitle: string
  prBody: string
}

export type ProposeChangeResult = { prUrl: string; prNumber: number }

/** Only what this needs — keeps it unit-testable without a real GitHub token. */
export type GitHubCodeClient = {
  getFileContent(path: string): Promise<GitHubFile>
  proposeChange(input: ProposeChangeInput): Promise<ProposeChangeResult>
}

type GitHubConfig = { token: string; owner: string; repo: string }

async function githubRequest<T>(config: GitHubConfig, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`GitHub API ${method} ${path} failed: HTTP ${response.status} ${detail}`.trim())
  }
  return (await response.json()) as T
}

export function createGitHubHttpCodeClient(config: GitHubConfig): GitHubCodeClient {
  const repoPath = `/repos/${config.owner}/${config.repo}`

  async function getDefaultBranch(): Promise<string> {
    const repoInfo = await githubRequest<{ default_branch: string }>(config, 'GET', repoPath)
    return repoInfo.default_branch
  }

  return {
    async getFileContent(path) {
      const data = await githubRequest<{ content: string; sha: string; encoding: string }>(
        config,
        'GET',
        `${repoPath}/contents/${path}`
      )
      const content = data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf8') : data.content
      return { content, sha: data.sha }
    },

    async proposeChange(input) {
      const defaultBranch = await getDefaultBranch()

      // 1. Latest commit SHA on the default branch — the new branch's starting point.
      const baseRef = await githubRequest<{ object: { sha: string } }>(
        config,
        'GET',
        `${repoPath}/git/ref/heads/${defaultBranch}`
      )

      // 2. Create the new branch from that commit.
      await githubRequest(config, 'POST', `${repoPath}/git/refs`, {
        ref: `refs/heads/${input.branchName}`,
        sha: baseRef.object.sha,
      })

      // 3. Get the current file's sha on the new branch (required by the
      // contents API to update rather than create) — falls back to
      // "create" (no sha) if the file doesn't exist yet.
      let existingSha: string | undefined
      try {
        const existing = await githubRequest<{ sha: string }>(
          config,
          'GET',
          `${repoPath}/contents/${input.path}?ref=${input.branchName}`
        )
        existingSha = existing.sha
      } catch {
        existingSha = undefined
      }

      // 4. Commit the change on the new branch.
      await githubRequest(config, 'PUT', `${repoPath}/contents/${input.path}`, {
        message: input.commitMessage,
        content: Buffer.from(input.newContent, 'utf8').toString('base64'),
        branch: input.branchName,
        ...(existingSha ? { sha: existingSha } : {}),
      })

      // 5. Open the PR — never merged automatically.
      const pr = await githubRequest<{ html_url: string; number: number }>(config, 'POST', `${repoPath}/pulls`, {
        title: input.prTitle,
        body: input.prBody,
        head: input.branchName,
        base: defaultBranch,
      })

      return { prUrl: pr.html_url, prNumber: pr.number }
    },
  }
}

export function createGitHubCodeClientFromEnv(): GitHubCodeClient {
  const token = process.env.GITHUB_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  if (!token || !repository) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY (e.g. "kev236/nexa-ai") must both be set.')
  }
  const [owner, repo] = repository.split('/')
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPOSITORY must be "owner/repo" — got "${repository}".`)
  }
  return createGitHubHttpCodeClient({ token, owner, repo })
}
