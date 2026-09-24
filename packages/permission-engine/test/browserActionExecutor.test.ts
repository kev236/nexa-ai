import { describe, expect, it } from 'vitest'
import { createBrowserActionExecutor } from '../src/executors/browserAction.js'
import type { BrowserActionClient } from '../src/adapters/browserActionAdapter.js'

function fakeClient(overrides: Partial<BrowserActionClient> = {}): BrowserActionClient {
  return {
    performAction: async () => ({ resultUrl: 'https://example.com/done', resultSummary: 'clicked' }),
    ...overrides,
  }
}

const CLICK_PAYLOAD = { url: 'https://example.com/signup', actionType: 'click', targetRole: 'button', targetName: 'Sign up' }

describe('browser_action executor', () => {
  it('replays the exact approved action and returns the result', async () => {
    let calledWith: unknown
    const executor = createBrowserActionExecutor(
      fakeClient({
        performAction: async (input) => {
          calledWith = input
          return { resultUrl: 'https://example.com/welcome', resultSummary: 'clicked, navigated to /welcome' }
        },
      })
    )

    const result = await executor(CLICK_PAYLOAD, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(result).toEqual({ resultUrl: 'https://example.com/welcome', resultSummary: 'clicked, navigated to /welcome' })
    expect(calledWith).toEqual(CLICK_PAYLOAD)
  })

  it('passes value through for a fill action', async () => {
    let calledWith: unknown
    const executor = createBrowserActionExecutor(
      fakeClient({
        performAction: async (input) => {
          calledWith = input
          return { resultUrl: 'https://example.com', resultSummary: 'filled' }
        },
      })
    )

    await executor(
      { url: 'https://example.com/signup', actionType: 'fill', targetRole: 'textbox', targetName: 'Email', value: 'me@example.com' },
      { businessId: 'biz_1', agentId: 'agent_1' }
    )

    expect(calledWith).toMatchObject({ actionType: 'fill', value: 'me@example.com' })
  })

  it('rejects a malformed payload', async () => {
    const executor = createBrowserActionExecutor(fakeClient())
    await expect(executor({ url: 'https://example.com' }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })

  it('rejects an unknown actionType', async () => {
    const executor = createBrowserActionExecutor(fakeClient())
    await expect(
      executor({ ...CLICK_PAYLOAD, actionType: 'submit' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/actionType must be one of/)
  })

  it('rejects a fill action with no value', async () => {
    const executor = createBrowserActionExecutor(fakeClient())
    await expect(
      executor({ url: 'https://example.com', actionType: 'fill', targetRole: 'textbox', targetName: 'Email' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/must include a non-empty value/)
  })
})
