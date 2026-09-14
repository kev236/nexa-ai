import { describe, expect, it } from 'vitest'
import { NexaLabsAdapter, type SanityFetchClient, type StripeReadClient } from '../src/adapters/nexaLabsAdapter.js'

function fakeClient(docs: unknown[]): SanityFetchClient {
  return {
    async fetch() {
      return docs as never
    },
  }
}

describe('NexaLabsAdapter', () => {
  it('maps a waitlist doc to a waitlist_signup event', async () => {
    const adapter = new NexaLabsAdapter(
      fakeClient([
        {
          _id: 'waitlist-1',
          _type: 'waitlist',
          email: 'lead@example.com',
          productName: 'Nexa SiteAudit',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ])
    )

    const events = await adapter.backfill()
    expect(events).toEqual([
      {
        source: 'nexalabs-web',
        type: 'waitlist_signup',
        payload: { email: 'lead@example.com', productName: 'Nexa SiteAudit' },
        occurredAt: '2026-01-01T00:00:00Z',
        externalId: 'waitlist-1',
      },
    ])
  })

  it('maps a contactMessage doc to a contact_message event', async () => {
    const adapter = new NexaLabsAdapter(
      fakeClient([
        {
          _id: 'contact-1',
          _type: 'contactMessage',
          name: 'Kevin',
          email: 'kevin@example.com',
          subject: 'Question',
          message: 'Hi',
          inquiryType: 'general',
          createdAt: '2026-01-02T00:00:00Z',
        },
      ])
    )

    const events = await adapter.backfill()
    expect(events[0]?.type).toBe('contact_message')
    expect(events[0]?.externalId).toBe('contact-1')
  })

  it('passes `since` through to observe() as a query param', async () => {
    let capturedParams: Record<string, unknown> | undefined
    const client: SanityFetchClient = {
      async fetch(_query, params) {
        capturedParams = params
        return []
      },
    }
    const adapter = new NexaLabsAdapter(client)
    await adapter.observe('2026-01-01T00:00:00Z')
    expect(capturedParams).toEqual({ since: '2026-01-01T00:00:00Z' })
  })

  it('has no registered actions and refuses to execute', async () => {
    const adapter = new NexaLabsAdapter(fakeClient([]))
    expect(adapter.listActions()).toEqual([])
    await expect(adapter.execute('anything', {})).rejects.toThrow(/no registered actions/)
  })

  it('reports health based on whether the query succeeds', async () => {
    const healthy = new NexaLabsAdapter(fakeClient([]))
    expect(await healthy.healthCheck()).toEqual({ ok: true })

    const unhealthy = new NexaLabsAdapter({
      async fetch() {
        throw new Error('network down')
      },
    })
    expect(await unhealthy.healthCheck()).toEqual({ ok: false, detail: 'network down' })
  })

  it('refuses to list transactions without a Stripe client configured', async () => {
    const adapter = new NexaLabsAdapter(fakeClient([]))
    await expect(adapter.listTransactions()).rejects.toThrow(/no Stripe client configured/)
  })

  it('maps charges, refunds, and payouts into ObservedTransactions, sorted by time', async () => {
    const stripe: StripeReadClient = {
      charges: {
        async list() {
          return { data: [{ id: 'ch_1', amount: 5000, currency: 'eur', status: 'succeeded', created: 1735776000 }] }
        },
      },
      refunds: {
        async list() {
          return { data: [{ id: 're_1', amount: 1000, currency: 'eur', status: 'succeeded', created: 1735689600 }] }
        },
      },
      payouts: {
        async list() {
          return { data: [{ id: 'po_1', amount: 4000, currency: 'eur', status: 'paid', created: 1735862400 }] }
        },
      },
    }
    const adapter = new NexaLabsAdapter(fakeClient([]), stripe)

    const transactions = await adapter.listTransactions()
    expect(transactions).toEqual([
      { type: 'refund', amountCents: 1000, currency: 'eur', externalRef: 're_1', status: 'succeeded', occurredAt: '2025-01-01T00:00:00.000Z' },
      { type: 'charge', amountCents: 5000, currency: 'eur', externalRef: 'ch_1', status: 'succeeded', occurredAt: '2025-01-02T00:00:00.000Z' },
      { type: 'payout', amountCents: 4000, currency: 'eur', externalRef: 'po_1', status: 'paid', occurredAt: '2025-01-03T00:00:00.000Z' },
    ])
  })

  it('passes `since` through to Stripe list calls as a created.gte filter', async () => {
    let captured: unknown
    const stripe: StripeReadClient = {
      charges: {
        async list(params) {
          captured = params
          return { data: [] }
        },
      },
      refunds: { async list() { return { data: [] } } },
      payouts: { async list() { return { data: [] } } },
    }
    const adapter = new NexaLabsAdapter(fakeClient([]), stripe)

    await adapter.listTransactions('2025-01-01T00:00:00.000Z')
    expect(captured).toEqual({ limit: 100, created: { gte: 1735689600 } })
  })
})
