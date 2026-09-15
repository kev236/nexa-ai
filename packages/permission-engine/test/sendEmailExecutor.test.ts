import { describe, expect, it } from 'vitest'
import { createSendEmailExecutor, type ResendClient } from '../src/executors/sendEmail.js'
import { InMemoryBusinessStore } from '../src/businesses/memoryStore.js'

function fakeResend(overrides: Partial<ResendClient['emails']> = {}): ResendClient {
  return {
    emails: {
      send: async () => ({ data: { id: 'email_123' }, error: null }),
      ...overrides,
    },
  }
}

describe('send_email executor', () => {
  it('sends from the business\'s configured emailFrom address', async () => {
    let captured: unknown
    const resend = fakeResend({
      send: async (payload) => {
        captured = payload
        return { data: { id: 'email_123' }, error: null }
      },
    })
    const businesses = new InMemoryBusinessStore(
      new Map([['biz_1', { emailFrom: 'Nexa Labs <support@nexalabs.tech>' }]])
    )
    const executor = createSendEmailExecutor(resend, businesses)

    const result = await executor(
      { to: 'lead@example.com', subject: 'Hi', body: 'Thanks for joining.' },
      { businessId: 'biz_1', agentId: 'agent_1' }
    )

    expect(captured).toEqual({
      from: 'Nexa Labs <support@nexalabs.tech>',
      to: 'lead@example.com',
      subject: 'Hi',
      text: 'Thanks for joining.',
    })
    expect(result).toEqual({ id: 'email_123', to: 'lead@example.com', subject: 'Hi' })
  })

  it('rejects a payload missing required string fields', async () => {
    const executor = createSendEmailExecutor(fakeResend(), new InMemoryBusinessStore())
    await expect(
      executor({ to: 'lead@example.com' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(TypeError)
  })

  it('throws when the business has no config.emailFrom set', async () => {
    const executor = createSendEmailExecutor(fakeResend(), new InMemoryBusinessStore())
    await expect(
      executor({ to: 'lead@example.com', subject: 'Hi', body: 'Hi' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/no config.emailFrom set/)
  })

  it('surfaces a Resend API error instead of returning a fake success', async () => {
    const resend = fakeResend({
      send: async () => ({ data: null, error: { message: 'invalid_from_address' } }),
    })
    const businesses = new InMemoryBusinessStore(new Map([['biz_1', { emailFrom: 'a@b.com' }]]))
    const executor = createSendEmailExecutor(resend, businesses)

    await expect(
      executor({ to: 'lead@example.com', subject: 'Hi', body: 'Hi' }, { businessId: 'biz_1', agentId: 'agent_1' })
    ).rejects.toThrow(/invalid_from_address/)
  })
})
