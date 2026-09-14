import type { JsonValue } from '../json.js'

export type ObservedEvent = {
  source: string
  type: string
  payload: JsonValue
  occurredAt: string
  /** Source-system id (a Sanity doc _id, a Stripe event id, ...) — makes ingestion idempotent. */
  externalId?: string
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
  listActions(): ActionDefinition[]
  execute(actionType: string, payload: JsonValue): Promise<JsonValue>
  healthCheck(): Promise<{ ok: boolean; detail?: string }>
}
