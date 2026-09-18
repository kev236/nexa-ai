# Self-improvement agent

`npm run propose-improvement [-- "optional focus area"]`

Finds its own target — no one has to tell it what to fix — reads and
edits real files with Anthropic's bash and text-editor tools, runs this
repo's own lint/typecheck/boundary/test checks, and opens a GitHub pull
request. It never merges, never pushes to `main`, never touches this
script's own directory, `.env*`, git history, or CI/deploy config.

This is the answer to "make it improve on its own" that doesn't cross
`readme.md`'s (this repo's, and `packages/permission-engine/README.md`'s)
own line against self-modification with no review: the agent can decide
what to change and write the change, but nothing it does takes effect
until a human reviews the PR and merges it. "Ask permission" *is* that
PR — same mechanism every other change in this repo already goes
through, not a new approval system invented for this one agent.

## Requires

- `ANTHROPIC_API_KEY` (already used elsewhere in this repo).
- `GITHUB_TOKEN` — a fine-grained PAT scoped to this repo only
  (Contents: Read and write, Pull requests: Read and write). Not a
  classic token with full `repo` scope.
- `GITHUB_REPOSITORY` — `"owner/repo"`.

## Running it on a schedule

Not wired into `vercel.json`'s crons on purpose — a self-directed
code-modifying agent running unattended on every deploy is a bigger
decision than a data-ingestion poll, and should be turned on
deliberately (e.g. a separate scheduled GitHub Action), not bundled in
by default alongside the read-only cron poll.
