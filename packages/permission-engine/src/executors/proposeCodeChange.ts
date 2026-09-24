import { randomUUID } from 'node:crypto'
import type { JsonValue } from '../json.js'
import type { GitHubCodeClient } from '../adapters/githubCodeAdapter.js'
import { createGitHubCodeClientFromEnv } from '../adapters/githubCodeAdapter.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

type ProposeCodeChangePayload = {
  path: string
  newContent: string
  commitMessage: string
  explanation: string
}

function assertPayload(payload: JsonValue): ProposeCodeChangePayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TypeError('propose_code_change payload must be an object')
  }
  const p = payload as Record<string, unknown>
  if (typeof p.path !== 'string' || !p.path) throw new TypeError('propose_code_change payload missing path')
  if (p.path.includes('..')) throw new TypeError('propose_code_change payload path must not contain ".."')
  if (typeof p.newContent !== 'string') throw new TypeError('propose_code_change payload missing newContent')
  if (typeof p.commitMessage !== 'string' || !p.commitMessage) {
    throw new TypeError('propose_code_change payload missing commitMessage')
  }
  if (typeof p.explanation !== 'string' || !p.explanation) {
    throw new TypeError('propose_code_change payload missing explanation')
  }
  return { path: p.path, newContent: p.newContent, commitMessage: p.commitMessage, explanation: p.explanation }
}

/**
 * The execute half of Nexa AI proposing a change to its own code — every
 * request reaching this already went through requestAction() with
 * requiresReview: true (see codeReview.ts), so this only ever runs
 * after a real owner Approve click on the exact diff shown in the
 * approval queue. Opens a pull request; never merges one — see
 * githubCodeAdapter.ts's own comment for why that line doesn't move.
 */
export function createProposeCodeChangeExecutor(client: GitHubCodeClient): ExecutorFn {
  return async (payload) => {
    const input = assertPayload(payload)
    const branchName = `nexa-ai/${input.path.replace(/[^a-z0-9_-]+/gi, '-')}-${randomUUID().slice(0, 8)}`

    const result = await client.proposeChange({
      path: input.path,
      newContent: input.newContent,
      commitMessage: input.commitMessage,
      branchName,
      prTitle: input.commitMessage,
      prBody: `${input.explanation}\n\n---\nOpened by Nexa AI, approved by the owner from the dashboard's approval queue. Review like any other PR before merging.`,
    })

    return { prUrl: result.prUrl, prNumber: result.prNumber }
  }
}

export function registerProposeCodeChangeExecutor(): void {
  registerExecutor('propose_code_change', createProposeCodeChangeExecutor(createGitHubCodeClientFromEnv()))
}
