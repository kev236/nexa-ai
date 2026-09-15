import { describe, expect, it } from 'vitest'
import { createEmailNotifier } from '../src/notifications/emailNotifier.js'
import type { ResendClient } from '../src/executors/sendEmail.js'
import { InMemoryOwnerStore } from '../src/owners/memoryStore.js'
import { InMemoryBusinessStore } from '../src/businesses/memoryStore.js'
import { createPermissionEngine } from '../src/engine.js'
import type { Notifier } from '../src/notifications/notifier.js'
import { hashPassword } from '../src/password.js'
import type { ActionRequest } from '../src/types.js'
import '../src/executors/noop.js'

function baseRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    businessId: 'biz_1',
    agentId: 'agent_1',
    actionType: 'noop',
    payload: { x: 1 },
    reasoning: 'a lead asked about pricing',
    expectedResult: { x: 1 },
    ...overrides,
  }
}

function fakeResend(overrides: Partial<ResendClient['emails']> = {}): ResendClient {
  return {
    emails: {
      send: async () => ({ data: { id: 'email_1' }, error: null }),
      ...overrides,
    },
  }
}

describe('createEmailNotifier', () => {
  it('emails every owner, from the business-configured address', async () => {
    const sent: unknown[] = []
    const resend = fakeResend({ send: async (payload) => (sent.push(payload), { data: { id: 'e1' }, error: null }) })
    const owners = new InMemoryOwnerStore([
      { email: 'kevin@nexalabs.tech', passwordHash: hashPassword('x') },
      { email: 'second@example.com', passwordHash: hashPassword('y') },
    ])
    const businesses = new InMemoryBusinessStore(new Map([['biz_1', { emailFrom: 'Nexa AI <ops@nexalabs.tech>' }]]))
    const notifier = createEmailNotifier(resend, owners, businesses)

    await notifier.notifyPendingApproval(baseRequest(), 'approval_1')

    expect(sent).toHaveLength(2)
    expect(sent).toContainEqual(
      expect.objectContaining({ from: 'Nexa AI <ops@nexalabs.tech>', to: 'kevin@nexalabs.tech' })
    )
    expect(sent).toContainEqual(
      expect.objectContaining({ from: 'Nexa AI <ops@nexalabs.tech>', to: 'second@example.com' })
    )
    const [payload] = sent as Array<{ subject: string; text: string }>
    if (!payload) throw new Error('expected at least one send')
    expect(payload.subject).toContain('noop')
    expect(payload.text).toContain('a lead asked about pricing')
    expect(payload.text).toContain('approval_1')
  })

  it('sends nothing when there are no owners', async () => {
    let called = false
    const resend = fakeResend({ send: async () => ((called = true), { data: { id: 'e1' }, error: null }) })
    const notifier = createEmailNotifier(resend, new InMemoryOwnerStore(), new InMemoryBusinessStore())

    await notifier.notifyPendingApproval(baseRequest(), 'approval_1')
    expect(called).toBe(false)
  })

  it('sends nothing when the business has no config.emailFrom set', async () => {
    let called = false
    const resend = fakeResend({ send: async () => ((called = true), { data: { id: 'e1' }, error: null }) })
    const owners = new InMemoryOwnerStore([{ email: 'kevin@nexalabs.tech', passwordHash: hashPassword('x') }])
    const notifier = createEmailNotifier(resend, owners, new InMemoryBusinessStore())

    await notifier.notifyPendingApproval(baseRequest(), 'approval_1')
    expect(called).toBe(false)
  })

  it('propagates a Resend failure rather than swallowing it — the engine decides how to handle that', async () => {
    const resend = fakeResend({ send: async () => ({ data: null, error: { message: 'rate_limited' } }) })
    const owners = new InMemoryOwnerStore([{ email: 'kevin@nexalabs.tech', passwordHash: hashPassword('x') }])
    const businesses = new InMemoryBusinessStore(new Map([['biz_1', { emailFrom: 'a@b.com' }]]))
    const notifier = createEmailNotifier(resend, owners, businesses)

    await expect(notifier.notifyPendingApproval(baseRequest(), 'approval_1')).rejects.toThrow(/rate_limited/)
  })
})

describe('engine notifier wiring (step 10)', () => {
  function fakeNotifier(): { notifier: Notifier; calls: Array<{ request: ActionRequest; approvalId: string }> } {
    const calls: Array<{ request: ActionRequest; approvalId: string }> = []
    return {
      calls,
      notifier: {
        async notifyPendingApproval(request, approvalId) {
          calls.push({ request, approvalId })
        },
      },
    }
  }

  it('notifies on a pending_approval outcome', async () => {
    const { notifier, calls } = fakeNotifier()
    const engine = createPermissionEngine({ notifier })

    const outcome = await engine.requestAction(baseRequest())
    if (outcome.status !== 'pending_approval') throw new Error('expected pending_approval')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.approvalId).toBe(outcome.approvalId)
  })

  it('does not notify when the action is denied at request time', async () => {
    const { notifier, calls } = fakeNotifier()
    const engine = createPermissionEngine({ notifier })

    await engine.requestAction(baseRequest({ actionType: 'no-such-executor' }))
    expect(calls).toHaveLength(0)
  })

  it('does nothing when no notifier is configured', async () => {
    const engine = createPermissionEngine()
    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
  })

  it('a throwing notifier never breaks requestAction — logged, not propagated', async () => {
    const notifier: Notifier = {
      async notifyPendingApproval() {
        throw new Error('resend is down')
      },
    }
    const engine = createPermissionEngine({ notifier })

    const outcome = await engine.requestAction(baseRequest())
    expect(outcome.status).toBe('pending_approval')
  })
})
