#!/usr/bin/env node
// Nexa AI's self-improvement agent — the owner's own framing: "improve
// on its own and has to ask permission to improve." It picks its own
// target (no human has to say what to fix), reads and edits real files,
// runs real verification commands, and stages a real commit — but it
// NEVER touches main and NEVER merges. The only thing it's ever allowed
// to produce is a pull request. "Ask permission" *is* that PR: nothing
// this agent does takes effect until the owner reviews it on GitHub and
// merges it themselves, the same way every other change in this repo
// ships. This is the deliberate boundary from this project's own
// founding rule ("no self-modification of limits... if you find or
// build a path that lets Nexa AI edit them, stop and flag it") — the
// agent can propose anything, including changes to its own code, but
// never apply anything unreviewed.
//
// Usage:
//   node tools/propose-improvement/run.mjs
//   node tools/propose-improvement/run.mjs "focus on the clip discovery agent's prompt"
//
// Requires: ANTHROPIC_API_KEY (already used elsewhere in this repo),
// GITHUB_TOKEN (a PAT with repo scope — new, only this tool needs it),
// GITHUB_REPOSITORY ("owner/repo").
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..')
const MODEL = 'claude-opus-5'
const MAX_TURNS = 40
const BASH_TIMEOUT_MS = 5 * 60 * 1000

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY is not set.')
  process.exit(1)
}
const githubToken = process.env.GITHUB_TOKEN
const githubRepo = process.env.GITHUB_REPOSITORY
if (!githubToken || !githubRepo) {
  console.error('GITHUB_TOKEN and GITHUB_REPOSITORY (e.g. "kev236/nexa-ai") must both be set.')
  process.exit(1)
}

const focus = process.argv.slice(2).join(' ').trim()

// --- Client-side tool handlers -------------------------------------------
//
// Anthropic-defined, schema-less tools (bash_20250124, text_editor_20250728)
// — Claude returns a tool_use block, this process executes it locally, and
// sends back a tool_result. Per the documented security guidance:
//   - text_editor: every path is resolved and confined to REPO_ROOT before
//     any read/write — a path that escapes it (.., symlink, absolute
//     outside the root) is refused, never opened.
//   - bash: this is a trusted, owner-run internal tool operating on the
//     owner's own repo (not a public/multi-tenant surface), and it
//     genuinely needs to run compound commands (npm run lint && npm run
//     build) to verify its own work — so unlike the doc's default
//     recommendation for an untrusted-multi-tenant setting, this does NOT
//     block shell operators. It does run inside REPO_ROOT with a timeout.
//     Known, accepted tradeoff, not an oversight: don't widen this tool's
//     usage to anything less trusted than "the owner's own scheduled job
//     against their own repo" without adding the stricter sandboxing.

function resolveInRepo(rawPath) {
  const resolved = path.resolve(REPO_ROOT, rawPath)
  const relative = path.relative(REPO_ROOT, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path "${rawPath}" escapes the repository root — refused.`)
  }
  return resolved
}

function runBash(input) {
  if (input.restart) {
    return 'Bash session reset (each command in this tool already runs independently, so there is no persistent state to lose).'
  }
  try {
    const output = execSync(input.command, {
      cwd: REPO_ROOT,
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return output || '(no output)'
  } catch (err) {
    const stdout = err.stdout?.toString() ?? ''
    const stderr = err.stderr?.toString() ?? ''
    return `Command failed (exit ${err.status ?? 'unknown'}):\n${stdout}\n${stderr}`.trim()
  }
}

function runTextEditor(input) {
  const command = input.command
  if (command === 'view') {
    const target = resolveInRepo(input.path)
    if (!existsSync(target)) throw new Error(`No such file or directory: ${input.path}`)
    if (statSync(target).isDirectory()) {
      return readdirSync(target).sort().join('\n') || '(empty directory)'
    }
    const lines = readFileSync(target, 'utf8').split('\n')
    const [start, end] = input.view_range ?? [1, lines.length]
    return lines
      .slice(start - 1, end)
      .map((line, i) => `${start + i}\t${line}`)
      .join('\n')
  }
  if (command === 'create') {
    const target = resolveInRepo(input.path)
    if (existsSync(target)) writeFileSync(`${target}.bak`, readFileSync(target))
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, input.file_text)
    return `Created ${input.path}`
  }
  if (command === 'str_replace') {
    const target = resolveInRepo(input.path)
    const content = readFileSync(target, 'utf8')
    const occurrences = content.split(input.old_str).length - 1
    if (occurrences === 0) throw new Error('old_str not found in file.')
    if (occurrences > 1) throw new Error(`old_str is not unique — found ${occurrences} occurrences.`)
    writeFileSync(target, content.replace(input.old_str, input.new_str))
    return `Replaced one occurrence in ${input.path}`
  }
  if (command === 'insert') {
    const target = resolveInRepo(input.path)
    const lines = readFileSync(target, 'utf8').split('\n')
    lines.splice(input.insert_line, 0, input.insert_text)
    writeFileSync(target, lines.join('\n'))
    return `Inserted into ${input.path} after line ${input.insert_line}`
  }
  throw new Error(`Unknown text editor command: ${command}`)
}

// --- System prompt ---------------------------------------------------------

const SYSTEM_PROMPT = `You are Nexa AI's self-improvement agent, running unattended against its own codebase at ${REPO_ROOT}.

Your job: find ONE real, concrete, worthwhile improvement and implement it. Then stop.
${focus ? `\nThe owner asked you to focus on: ${focus}\n` : '\nYou choose the target — read recent code, tests, and any obvious rough edges to find something real, not invented busywork.'}

Rules, no exceptions:
- Scope to one real, verifiable improvement per run — a bug fix, a small well-scoped feature, a prompt/agent-logic tuning, a test gap, a genuine cleanup. Not a rewrite, not "several things at once."
- Never touch: .env, .env.local, any file matching a secret/credential pattern, git history, CI/deploy config, or this very script (tools/propose-improvement/) — if you think one of those needs changing, stop and explain why in your final summary instead of changing it.
- Never weaken this project's own safety invariants: the permission engine, audit logging, spending-always-waits-for-approval, or the "no module outside permission-engine imports credentials" boundary (enforced by \`npm run check:boundaries\`).
- Before finishing, run the real checks this repo uses: \`npm run lint\`, \`npm run typecheck\`, \`npm run check:boundaries\`, and \`npm test\` (from ${REPO_ROOT}). If any fail because of your change, fix it before finishing. Do not finish with a known-broken change.
- End with a plain-text summary: what you changed and why, in the same voice as this repo's own commit messages (explain the reasoning, not just the diff).
- You are proposing, not deciding — everything you do lands in a pull request the owner must approve. Never attempt to push to main, merge, or bypass review.`

// --- Agent loop --------------------------------------------------------

const client = new Anthropic({ apiKey })
const tools = [
  { type: 'bash_20250124', name: 'bash' },
  { type: 'text_editor_20250728', name: 'str_replace_based_edit_tool' },
]

const messages = [{ role: 'user', content: 'Find and implement one real improvement, then summarize it.' }]
let finalSummary = ''

for (let turn = 0; turn < MAX_TURNS; turn++) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools,
    messages,
  })

  if (response.stop_reason === 'refusal') {
    console.error('Claude refused this run:', JSON.stringify(response.stop_details))
    process.exit(1)
  }

  messages.push({ role: 'assistant', content: response.content })

  const toolUses = response.content.filter((block) => block.type === 'tool_use')
  if (toolUses.length === 0) {
    finalSummary = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
    break
  }

  const toolResults = []
  for (const toolUse of toolUses) {
    try {
      const result = toolUse.name === 'bash' ? runBash(toolUse.input) : runTextEditor(toolUse.input)
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: String(result) })
    } catch (err) {
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: err instanceof Error ? err.message : String(err),
        is_error: true,
      })
    }
  }
  messages.push({ role: 'user', content: toolResults })
}

if (!finalSummary) {
  console.error(`Hit the ${MAX_TURNS}-turn limit without the agent producing a final summary — stopping without opening a PR.`)
  process.exit(1)
}

console.log('Agent summary:\n' + finalSummary)

// --- Ship it as a PR, never as a direct change --------------------------

const status = execSync('git status --short', { cwd: REPO_ROOT, encoding: 'utf8' })
if (!status.trim()) {
  console.log('No files changed — nothing to propose this run.')
  process.exit(0)
}

const slug = new Date().toISOString().replace(/[:.]/g, '-')
const branch = `propose-improvement/${slug}`
execFileSync('git', ['checkout', '-b', branch], { cwd: REPO_ROOT, stdio: 'inherit' })
execFileSync('git', ['add', '-A'], { cwd: REPO_ROOT, stdio: 'inherit' })

const commitTitle = finalSummary.split('\n').find((line) => line.trim()) ?? 'Self-improvement agent proposal'
execFileSync('git', ['commit', '-m', commitTitle.slice(0, 72), '-m', finalSummary], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
})
execFileSync('git', ['push', '-u', 'origin', branch], { cwd: REPO_ROOT, stdio: 'inherit' })

const [owner, repo] = githubRepo.split('/')
const defaultBranch = execSync('git remote show origin', { cwd: REPO_ROOT, encoding: 'utf8' })
  .split('\n')
  .find((line) => line.includes('HEAD branch'))
  ?.split(':')[1]
  ?.trim() ?? 'main'

const prResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: `🤖 ${commitTitle.slice(0, 68)}`,
    head: branch,
    base: defaultBranch,
    body: `Opened automatically by Nexa AI's self-improvement agent (\`tools/propose-improvement/run.mjs\`). Nothing here takes effect until you review and merge it.\n\n---\n\n${finalSummary}`,
  }),
})

if (!prResponse.ok) {
  console.error(`Branch pushed, but opening the PR failed: HTTP ${prResponse.status} ${await prResponse.text()}`)
  process.exit(1)
}

const pr = await prResponse.json()
console.log(`Opened for review: ${pr.html_url}`)
