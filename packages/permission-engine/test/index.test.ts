import { describe, expect, it } from 'vitest'
import { requestAction, resolveApproval } from '../src/index.js'

// Exercises the exact bare-function public surface described in
// docs/plan-001-foundations.md section 3b — not the createPermissionEngine
// factory used elsewhere for test isolation.
describe('public default singleton', () => {
  it('requestAction/resolveApproval work end to end against the package entry point', async () => {
    const outcome = await requestAction({
      businessId: 'biz_1',
      agentId: 'agent_1',
      actionType: 'noop',
      payload: { via: 'index' },
      reasoning: 'exercise the public entry point',
      expectedResult: { via: 'index' },
    })
    expect(outcome.status).toBe('pending_approval')
    if (outcome.status !== 'pending_approval') return

    const resolved = await resolveApproval(outcome.approvalId, 'approved', 'owner_kevin')
    expect(resolved.status).toBe('executed')
  })
})
