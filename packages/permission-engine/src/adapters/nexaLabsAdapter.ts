import { createClient } from '@sanity/client'
import type { JsonValue } from '../json.js'
import type { ActionDefinition, BusinessAdapter, ObservedEvent } from './types.js'

/** Only what this adapter needs — keeps it unit-testable without a real Sanity client. */
export type SanityFetchClient = {
  fetch<T = unknown>(query: string, params?: Record<string, unknown>): Promise<T>
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

  constructor(private readonly client: SanityFetchClient) {}

  async backfill(): Promise<ObservedEvent[]> {
    return this.fetchDocuments()
  }

  async observe(since: string): Promise<ObservedEvent[]> {
    return this.fetchDocuments(since)
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
  return new NexaLabsAdapter(client)
}
