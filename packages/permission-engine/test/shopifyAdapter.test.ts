import { describe, expect, it } from 'vitest'
import { ShopifyAdapter, type ShopifyOrderNode, type ShopifyReadClient } from '../src/adapters/shopifyAdapter.js'

function fakeClient(orders: ShopifyOrderNode[], shopName = 'My Store'): ShopifyReadClient {
  return {
    async listOrders() {
      return orders
    },
    async shopName() {
      return shopName
    },
  }
}

const ORDER: ShopifyOrderNode = {
  id: 'gid://shopify/Order/1',
  name: '#1001',
  email: 'buyer@example.com',
  createdAt: '2026-01-02T00:00:00Z',
  displayFinancialStatus: 'PAID',
  displayFulfillmentStatus: 'UNFULFILLED',
  totalPriceSet: { shopMoney: { amount: '49.99', currencyCode: 'EUR' } },
}

describe('ShopifyAdapter', () => {
  it('has no content-event stream — backfill/observe are always empty', async () => {
    const adapter = new ShopifyAdapter(fakeClient([ORDER]))
    expect(await adapter.backfill()).toEqual([])
    expect(await adapter.observe()).toEqual([])
  })

  it('has no registered actions and refuses to execute', async () => {
    const adapter = new ShopifyAdapter(fakeClient([]))
    expect(adapter.listActions()).toEqual([])
    await expect(adapter.execute('anything')).rejects.toThrow(/no registered actions/)
  })

  it('reports health based on whether the shop-name query succeeds', async () => {
    const healthy = new ShopifyAdapter(fakeClient([], 'Drinkware Co'))
    expect(await healthy.healthCheck()).toEqual({ ok: true, detail: 'Drinkware Co' })

    const unhealthy = new ShopifyAdapter({
      async listOrders() {
        return []
      },
      async shopName() {
        throw new Error('invalid access token')
      },
    })
    expect(await unhealthy.healthCheck()).toEqual({ ok: false, detail: 'invalid access token' })
  })

  it('maps an order to an ObservedTransaction, converting euros to cents', async () => {
    const adapter = new ShopifyAdapter(fakeClient([ORDER]))
    const transactions = await adapter.listTransactions()
    expect(transactions).toEqual([
      {
        type: 'charge',
        amountCents: 4999,
        currency: 'EUR',
        externalRef: 'gid://shopify/Order/1',
        status: 'PAID',
        occurredAt: '2026-01-02T00:00:00Z',
      },
    ])
  })

  it('sorts multiple orders by occurredAt', async () => {
    const later: ShopifyOrderNode = { ...ORDER, id: 'gid://shopify/Order/2', createdAt: '2026-01-03T00:00:00Z' }
    const earlier: ShopifyOrderNode = { ...ORDER, id: 'gid://shopify/Order/3', createdAt: '2026-01-01T00:00:00Z' }
    const adapter = new ShopifyAdapter(fakeClient([later, ORDER, earlier]))

    const transactions = await adapter.listTransactions()
    expect(transactions.map((t) => t.externalRef)).toEqual([
      'gid://shopify/Order/3',
      'gid://shopify/Order/1',
      'gid://shopify/Order/2',
    ])
  })

  it('passes `since` through to listOrders', async () => {
    let captured: string | undefined
    const adapter = new ShopifyAdapter({
      async listOrders(since) {
        captured = since
        return []
      },
      async shopName() {
        return 'x'
      },
    })
    await adapter.listTransactions('2026-01-01T00:00:00Z')
    expect(captured).toBe('2026-01-01T00:00:00Z')
  })
})
