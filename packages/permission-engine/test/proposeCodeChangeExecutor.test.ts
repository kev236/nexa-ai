import { describe, expect, it } from 'vitest'
import { createProposeCodeChangeExecutor } from '../src/executors/proposeCodeChange.js'
import type { GitHubCodeClient } from '../src/adapters/githubCodeAdapter.js'

function fakeClient(overrides: Partial<GitHubCodeClient> = {}): GitHubCodeClient {
  return {
    getFileContent: async () => ({ content: '', sha: 'sha_1' }),
    proposeChange: async () => ({ prUrl: 'https://github.com/kev236/nexa-ai/pull/1', prNumber: 1 }),
    ...overrides,
  }
}

const PAYLOAD = {
  path: 'packages/dashboard/src/lib/format.ts',
  newContent: 'export function noop() {}\n',
  commitMessage: 'Fix a bug in format.ts',
  explanation: 'Found a real bug while reviewing: the date formatter crashed on null input.',
}

describe('propose_code_change executor', () => {
  it('opens a PR with a branch name derived from the file path, never merges', async () => {
    let calledWith: unknown
    const executor = createProposeCodeChangeExecutor(
      fakeClient({
        proposeChange: async (input) => {
          calledWith = input
          return { prUrl: 'https://github.com/kev236/nexa-ai/pull/42', prNumber: 42 }
        },
      })
    )

    const result = await executor(PAYLOAD, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(result).toEqual({ prUrl: 'https://github.com/kev236/nexa-ai/pull/42', prNumber: 42 })
    expect(calledWith).toMatchObject({
      path: PAYLOAD.path,
      newContent: PAYLOAD.newContent,
      commitMessage: PAYLOAD.commitMessage,
      prTitle: PAYLOAD.commitMessage,
    })
    expect((calledWith as { branchName: string }).branchName).toMatch(/^nexa-ai\//)
    expect((calledWith as { prBody: string }).prBody).toContain(PAYLOAD.explanation)
  })

  it('rejects a path containing ".."', async () => {
    const executor = createProposeCodeChangeExecutor(fakeClient())
    await expect(
      executor({ ...PAYLOAD, path: '../../etc/passwd' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/must not contain/)
  })

  it('rejects a malformed payload', async () => {
    const executor = createProposeCodeChangeExecutor(fakeClient())
    await expect(executor({ path: 'x' }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })
})
