import type { JsonValue } from '../json.js'
import type { ActionDefinition, BusinessAdapter, ObservedEvent, ObservedTransaction } from './types.js'

/**
 * Only the fields this adapter reads off an order — every name here was
 * verified live against the real connected store's GraphQL schema
 * (graphql_schema('Order') / ('MoneyBag') / ('MoneyV2') via the Shopify
 * MCP connector) rather than guessed. shopify.dev itself isn't reachable
 * from every sandbox, so that live check stood in for it.
 */
export type ShopifyOrderNode = {
  id: string
  name: string
  email: string | null
  createdAt: string
  displayFinancialStatus: string
  displayFulfillmentStatus: string
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
}

/** Only what this adapter needs — keeps it unit-testable without a real Shopify client. */
export type ShopifyReadClient = {
  listOrders(since?: string): Promise<ShopifyOrderNode[]>
  shopName(): Promise<string>
}

/**
 * Step 26: the dropshipping business's read-only view of orders — the
 * Shopify analog of NexaLabsAdapter's Stripe/crypto listTransactions().
 * GraphQL Admin API only: Shopify's REST Admin API went legacy in
 * October 2024 and any new integration is required to target GraphQL
 * (see .env.example's note on this).
 *
 * There's no content-event stream the way NexaLabsAdapter has
 * waitlist/contact docs — a dropshipping store's only observable signal
 * today is orders, which is money movement, not a content event, so
 * backfill()/observe() are trivially empty and listTransactions()
 * carries the real data. No execute capability yet, same reasoning as
 * every other adapter added this way: nothing safe to write to on this
 * business's behalf until a real action type is designed and approved.
 */
export class ShopifyAdapter implements BusinessAdapter {
  readonly adapterType = 'shopify'

  constructor(private readonly client: ShopifyReadClient) {}

  async backfill(): Promise<ObservedEvent[]> {
    return []
  }

  async observe(): Promise<ObservedEvent[]> {
    return []
  }

  /**
   * Omitted `since` returns everything available (a backfill); a value
   * restricts to orders created at or after it (a poll) — same
   * convention as NexaLabsAdapter.listTransactions().
   */
  async listTransactions(since?: string): Promise<ObservedTransaction[]> {
    const orders = await this.client.listOrders(since)
    return orders.map(toObservedTransaction).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  }

  listActions(): ActionDefinition[] {
    return []
  }

  async execute(actionType: string): Promise<JsonValue> {
    throw new Error(`ShopifyAdapter has no registered actions yet (requested "${actionType}")`)
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const name = await this.client.shopName()
      return { ok: true, detail: name }
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) }
    }
  }
}

/**
 * Shopify doesn't expose a refund as a separate record the way Stripe
 * does charges/refunds/payouts — a refund shows up as a status change
 * on the same order, not a new one. Mapping every order to 'charge'
 * matches what the API actually returns rather than inventing a
 * distinction the data doesn't support; `status` carries the real
 * financial state (e.g. 'REFUNDED', 'PARTIALLY_REFUNDED').
 */
function toObservedTransaction(order: ShopifyOrderNode): ObservedTransaction {
  return {
    type: 'charge',
    amountCents: Math.round(Number.parseFloat(order.totalPriceSet.shopMoney.amount) * 100),
    currency: order.totalPriceSet.shopMoney.currencyCode,
    externalRef: order.id,
    status: order.displayFinancialStatus,
    occurredAt: order.createdAt,
  }
}

const ORDERS_QUERY = `#graphql
  query ObservedOrders($first: Int!, $query: String) {
    orders(first: $first, query: $query, sortKey: CREATED_AT) {
      nodes {
        id
        name
        email
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
  }
`

const SHOP_NAME_QUERY = `#graphql
  query ShopName {
    shop {
      name
    }
  }
`

export function createShopifyAdapter(): ShopifyAdapter {
  return new ShopifyAdapter(createShopifyHttpClient())
}

/**
 * API version 2026-07 — confirmed current (not guessed) via Shopify's
 * own docs search as of this adapter's writing; bump it forward as
 * later versions release rather than trusting this comment to stay true.
 */
const SHOPIFY_API_VERSION = '2026-07'

export function createShopifyHttpClient(): ShopifyReadClient {
  const rawShopDomain = process.env.SHOPIFY_SHOP_DOMAIN
  const rawAccessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN
  if (!rawShopDomain || !rawAccessToken) {
    throw new Error(
      'SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_API_ACCESS_TOKEN must both be set to construct the ShopifyAdapter.'
    )
  }
  // Re-bound as explicitly-typed consts — TS doesn't retain the guard's
  // narrowing on process.env values once they're captured by the nested
  // graphql() closure below.
  const shopDomain: string = rawShopDomain
  const accessToken: string = rawAccessToken

  async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok) {
      throw new Error(`Shopify Admin API returned HTTP ${response.status}: ${await response.text()}`)
    }
    const body = (await response.json()) as { data?: T; errors?: { message: string }[] }
    if (body.errors?.length) {
      throw new Error(`Shopify Admin API error: ${body.errors.map((e) => e.message).join('; ')}`)
    }
    if (!body.data) {
      throw new Error('Shopify Admin API returned no data')
    }
    return body.data
  }

  return {
    async listOrders(since) {
      const query = since ? `created_at:>='${since}'` : undefined
      const data = await graphql<{ orders: { nodes: ShopifyOrderNode[] } }>(ORDERS_QUERY, { first: 100, query })
      return data.orders.nodes
    },
    async shopName() {
      const data = await graphql<{ shop: { name: string } }>(SHOP_NAME_QUERY)
      return data.shop.name
    },
  }
}
