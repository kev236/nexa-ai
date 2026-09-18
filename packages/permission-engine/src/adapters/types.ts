import type { JsonValue } from '../json.js'

export type ObservedEvent = {
  source: string
  type: string
  payload: JsonValue
  occurredAt: string
  /** Source-system id (a Sanity doc _id, a Stripe event id, ...) — makes ingestion idempotent. */
  externalId?: string
}

/**
 * Step 7: a read-only view of money movement, distinct from ObservedEvent
 * — narrower and typed, matching the `transactions` table (section 3a of
 * the plan doc) rather than the free-form `events` one. Observability
 * only: nothing here creates a charge, refund, or payout.
 */
export type ObservedTransaction = {
  type: 'charge' | 'refund' | 'payout'
  amountCents: number
  currency: string
  /** Source-system id (a Stripe charge/refund/payout id) — makes ingestion idempotent. */
  externalRef: string
  status: string
  occurredAt: string
}

export type ActionDefinition = {
  actionType: string
}

/**
 * docs/plan-001-foundations.md section 3c. Designed against the harder
 * future case (an integration that's only an API and a spreadsheet), not
 * just against nexalabs. Credentials are injected at construction — an
 * adapter never reads process.env for its own secrets (its `create*()`
 * factory does, analogous to how the Postgres stores' factories do).
 */
export interface BusinessAdapter {
  readonly adapterType: string
  backfill(): Promise<ObservedEvent[]>
  observe(since: string): Promise<ObservedEvent[]>
  registerWebhook?(callbackUrl: string): Promise<{ webhookId: string }>
  /**
   * Optional — only adapters backed by a payment processor implement
   * this (step 7). Omitted `since` means "everything available," same
   * convention as backfill() vs observe() for events, but there is no
   * separate backfill/observe pair here since `transactions` doesn't
   * track an ingestion_mode column.
   */
  listTransactions?(since?: string): Promise<ObservedTransaction[]>
  listActions(): ActionDefinition[]
  execute(actionType: string, payload: JsonValue): Promise<JsonValue>
  healthCheck(): Promise<{ ok: boolean; detail?: string }>
}
