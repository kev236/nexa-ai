import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import { InMemoryOwnerStore } from '../src/owners/memoryStore.js'
import { hashPassword } from '../src/password.js'
import type { ActionRequest } from '../src/types.js'
import '../src/executors/noop.js'

function baseRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    businessId: 'biz_1',
    agentId: 'agent_1',
    actionType: 'noop',
    payload: { x: 1 },
    reasoning: 'test exercise',
    expectedResult: { x: 1 },
    ...overrides,
  }
}

describe('verifyOwnerCredentials', () => {
  function engineWithOwner() {
    const ownerStore = new InMemoryOwnerStore([
      { email: 'kevin@nexalabs.tech', passwordHash: hashPassword('correct-horse') },
    ])
    return createPermissionEngine({ ownerStore })
  }

  it('returns an ownerId for correct credentials', async () => {
    const engine = engineWithOwner()
    const result = await engine.verifyOwnerCredentials('kevin@nexalabs.tech', 'correct-horse')
    expect(result).not.toBeNull()
    expect(result?.ownerId).toBeDefined()
  })

  it('returns null for a wrong password', async () => {
    const engine = engineWithOwner()
    const result = await engine.verifyOwnerCredentials('kevin@nexalabs.tech', 'wrong')
    expect(result).toBeNull()
  })

  it('returns null for an unknown email, without throwing', async () => {
    const engine = engineWithOwner()
    const result = await engine.verifyOwnerCredentials('nobody@example.com', 'anything')
    expect(result).toBeNull()
  })
})

describe('OwnerStore.listAll (step 10)', () => {
  it('lists every owner — who a notifier has to reach', async () => {
    const ownerStore = new InMemoryOwnerStore([
      { email: 'kevin@nexalabs.tech', passwordHash: hashPassword('a') },
      { email: 'second-owner@example.com', passwordHash: hashPassword('b') },
    ])
    const owners = await ownerStore.listAll()
    expect(owners.map((o) => o.email).sort()).toEqual(['kevin@nexalabs.tech', 'second-owner@example.com'])
  })

  it('returns an empty list when there are no owners', async () => {
    const ownerStore = new InMemoryOwnerStore()
    expect(await ownerStore.listAll()).toEqual([])
  })
})

describe('listPendingApprovals', () => {
  it('lists only pending approvals, oldest first, across multiple businesses', async () => {
    const engine = createPermissionEngine()

    const first = await engine.requestAction(baseRequest({ businessId: 'biz_1' }))
    const second = await engine.requestAction(baseRequest({ businessId: 'biz_2' }))
    if (first.status !== 'pending_approval' || second.status !== 'pending_approval') {
      throw new Error('expected pending_approval')
    }

    // Resolve the first one — it should drop out of the pending list.
    await engine.resolveApproval(first.approvalId, 'approved', 'owner_kevin')

    const pending = await engine.listPendingApprovals()
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(second.approvalId)
  })

  it('returns an empty list when nothing is pending', async () => {
    const engine = createPermissionEngine()
    expect(await engine.listPendingApprovals()).toEqual([])
  })
})
