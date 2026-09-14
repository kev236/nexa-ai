import { describe, expect, it } from 'vitest'
import {
  NexaLabsAdapter,
  type EtherscanClient,
  type SanityFetchClient,
  type StripeReadClient,
} from '../src/adapters/nexaLabsAdapter.js'

const WALLET = '0x11a3367E066539d08aa81B23dbc626755116cfC1'
const USDC_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

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

  it('refuses to list transactions with no payment source configured', async () => {
    const adapter = new NexaLabsAdapter(fakeClient([]))
    await expect(adapter.listTransactions()).rejects.toThrow(/no payment source configured/)
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

  it('maps incoming USDC transfers to charges and outgoing ones to payouts', async () => {
    const etherscan: EtherscanClient = {
      async getTokenTransfers(address, contractAddress) {
        expect(address).toBe(WALLET)
        expect(contractAddress).toBe(USDC_CONTRACT)
        return [
          // Incoming: someone paid the wallet 25.50 USDC (6 decimals).
          { hash: '0xin', from: '0xpayer', to: WALLET, value: '25500000', tokenDecimal: '6', timeStamp: '1735689600' },
          // Outgoing: the wallet sent 10 USDC elsewhere.
          { hash: '0xout', from: WALLET, to: '0xsomeoneelse', value: '10000000', tokenDecimal: '6', timeStamp: '1735776000' },
        ]
      },
    }
    const adapter = new NexaLabsAdapter(fakeClient([]), undefined, {
      client: etherscan,
      walletAddress: WALLET,
      tokenContractAddress: USDC_CONTRACT,
    })

    const transactions = await adapter.listTransactions()
    expect(transactions).toEqual([
      { type: 'charge', amountCents: 2550, currency: 'usdc', externalRef: '0xin', status: 'succeeded', occurredAt: '2025-01-01T00:00:00.000Z' },
      { type: 'payout', amountCents: 1000, currency: 'usdc', externalRef: '0xout', status: 'succeeded', occurredAt: '2025-01-02T00:00:00.000Z' },
    ])
  })

  it('filters crypto transfers by `since`, and merges with Stripe when both are configured', async () => {
    const etherscan: EtherscanClient = {
      async getTokenTransfers() {
        return [
          { hash: '0xold', from: '0xpayer', to: WALLET, value: '1000000', tokenDecimal: '6', timeStamp: '1704067200' }, // 2024-01-01
          { hash: '0xnew', from: '0xpayer', to: WALLET, value: '2000000', tokenDecimal: '6', timeStamp: '1735689600' }, // 2025-01-01
        ]
      },
    }
    const allCharges = [
      { id: 'ch_old', amount: 500, currency: 'eur', status: 'succeeded', created: 1735603200 }, // 2024-12-31
      { id: 'ch_new', amount: 700, currency: 'eur', status: 'succeeded', created: 1735776000 }, // 2025-01-02
    ]
    const stripe: StripeReadClient = {
      charges: {
        // A real Stripe API filters server-side on `created.gte` — this fake does the same.
        async list(params) {
          const gte = params.created?.gte
          return { data: gte ? allCharges.filter((c) => c.created >= gte) : allCharges }
        },
      },
      refunds: { async list() { return { data: [] } } },
      payouts: { async list() { return { data: [] } } },
    }
    const adapter = new NexaLabsAdapter(fakeClient([]), stripe, {
      client: etherscan,
      walletAddress: WALLET,
      tokenContractAddress: USDC_CONTRACT,
    })

    const transactions = await adapter.listTransactions('2025-01-01T00:00:00.000Z')
    expect(transactions.map((t) => t.externalRef).sort()).toEqual(['0xnew', 'ch_new'])
  })
})
