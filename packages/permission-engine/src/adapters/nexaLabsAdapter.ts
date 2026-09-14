import { createClient } from '@sanity/client'
import Stripe from 'stripe'
import type { JsonValue } from '../json.js'
import type { ActionDefinition, BusinessAdapter, ObservedEvent, ObservedTransaction } from './types.js'

/** Only what this adapter needs — keeps it unit-testable without a real Sanity client. */
export type SanityFetchClient = {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>
}

type StripeListable = { id: string; amount: number; currency: string; status: string | null; created: number }

/** Only what this adapter needs — keeps it unit-testable without a real Stripe client. */
export type StripeReadClient = {
  charges: { list(params: { limit?: number; created?: { gte: number } }): Promise<{ data: StripeListable[] }> }
  refunds: { list(params: { limit?: number; created?: { gte: number } }): Promise<{ data: StripeListable[] }> }
  payouts: { list(params: { limit?: number; created?: { gte: number } }): Promise<{ data: StripeListable[] }> }
}

type SanityDoc = {
  _id: string
  _type: 'waitlist' | 'contactMessage'
  createdAt: string
  [key: string]: unknown
}

const OBSERVED_TYPES = ['waitlist', 'contactMessage'] as const

/**
 * Observes nexalabs.tech's Sanity content — waitlist signups and contact
 * messages, the only two document types the live site actually writes to
 * (see docs/plan-001-foundations.md section 1: `product` is dead schema,
 * everything else is read-only marketing content). No execute capability
 * yet — nexalabs has nothing safe to write to on its behalf until a real
 * action type is designed and approved.
 */
export class NexaLabsAdapter implements BusinessAdapter {
  readonly adapterType = 'nexalabs-web'

  constructor(
    private readonly client: SanityFetchClient,
    private readonly stripe?: StripeReadClient
  ) {}

  async backfill(): Promise<ObservedEvent[]> {
    return this.fetchDocuments()
  }

  async observe(since: string): Promise<ObservedEvent[]> {
    return this.fetchDocuments(since)
  }

  /**
   * Read-only Stripe view (plan doc section 3d, step 7): lists charges,
   * refunds, and payouts — never creates any of them. A single page
   * (limit 100) per resource, same "prove the shape, not scale" level of
   * effort as this adapter's Sanity side. Omitted `since` returns
   * everything available (a backfill); a value restricts to transactions
   * created at or after it (a poll).
   */
  async listTransactions(since?: string): Promise<ObservedTransaction[]> {
    if (!this.stripe) {
      throw new Error('NexaLabsAdapter has no Stripe client configured (STRIPE_SECRET_KEY not set)')
    }
    const created = since ? { gte: Math.floor(new Date(since).getTime() / 1000) } : undefined
    const params = { limit: 100, ...(created ? { created } : {}) }

    const [charges, refunds, payouts] = await Promise.all([
      this.stripe.charges.list(params),
      this.stripe.refunds.list(params),
      this.stripe.payouts.list(params),
    ])

    return [
      ...charges.data.map((c) => toObservedTransaction('charge', c)),
      ...refunds.data.map((r) => toObservedTransaction('refund', r)),
      ...payouts.data.map((p) => toObservedTransaction('payout', p)),
    ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  }

  private async fetchDocuments(since?: string): Promise<ObservedEvent[]> {
    const typeFilter = OBSERVED_TYPES.map((t) => `_type == "${t}"`).join(' || ')
    const sinceFilter = since ? ' && createdAt > $since' : ''
    const query = `*[(${typeFilter})${sinceFilter}] | order(createdAt asc)`
    const docs = await this.client.fetch<SanityDoc[]>(query, since ? { since } : {})
    return docs.map((doc) => toObservedEvent(doc))
  }

  listActions(): ActionDefinition[] {
    return []
  }

  async execute(actionType: string): Promise<JsonValue> {
    throw new Error(`NexaLabsAdapter has no registered actions yet (requested "${actionType}")`)
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.client.fetch(`*[_type == "waitlist"][0]{_id}`)
      return { ok: true }
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) }
    }
  }
}

function toObservedTransaction(
  type: ObservedTransaction['type'],
  source: StripeListable
): ObservedTransaction {
  return {
    type,
    amountCents: source.amount,
    currency: source.currency,
    externalRef: source.id,
    status: source.status ?? 'unknown',
    occurredAt: new Date(source.created * 1000).toISOString(),
  }
}

function toObservedEvent(doc: SanityDoc): ObservedEvent {
  const { _id, _type, createdAt, ...rest } = doc
  const type = _type === 'waitlist' ? 'waitlist_signup' : 'contact_message'
  return {
    source: 'nexalabs-web',
    type,
    payload: rest as JsonValue,
    occurredAt: createdAt,
    externalId: _id,
  }
}

export function createNexaLabsAdapter(): BusinessAdapter {
  const projectId = process.env.SANITY_PROJECT_ID
  const dataset = process.env.SANITY_DATASET
  if (!projectId || !dataset) {
    throw new Error(
      'SANITY_PROJECT_ID and SANITY_DATASET must be set to construct the NexaLabsAdapter (SANITY_READ_TOKEN too, unless the dataset is public).'
    )
  }
  const client = createClient({
    projectId,
    dataset,
    token: process.env.SANITY_READ_TOKEN,
    apiVersion: '2024-01-01',
    useCdn: false,
  })

  // Optional — the Sanity side (events) still works without it. Only
  // listTransactions() needs this; it throws its own clear error if
  // called without it, rather than failing adapter construction.
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : undefined

  return new NexaLabsAdapter(client, stripe)
}
