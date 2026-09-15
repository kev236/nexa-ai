import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import type { BusinessAdapter, ObservedEvent } from '../src/adapters/types.js'

function fakeAdapter(backfillEvents: ObservedEvent[], observeEvents: ObservedEvent[] = []): BusinessAdapter {
  return {
    adapterType: 'fake-adapter',
    async backfill() {
      return backfillEvents
    },
    async observe() {
      return observeEvents
    },
    listActions() {
      return []
    },
    async execute() {
      throw new Error('not implemented')
    },
    async healthCheck() {
      return { ok: true }
    },
  }
}

describe('ingestEvents', () => {
  it('records every observed event on first backfill', async () => {
    const engine = createPermissionEngine()
    const adapter = fakeAdapter([
      { source: 'fake', type: 'signup', payload: { n: 1 }, occurredAt: '2026-01-01T00:00:00Z', externalId: 'a' },
      { source: 'fake', type: 'signup', payload: { n: 2 }, occurredAt: '2026-01-02T00:00:00Z', externalId: 'b' },
    ])

    const summary = await engine.ingestEvents(adapter, 'biz_1', 'backfill')
    expect(summary).toEqual({ observed: 2, inserted: 2, skipped: 0 })

    const stored = await engine.eventStore.listByBusiness('biz_1')
    expect(stored).toHaveLength(2)
    expect(stored[0]?.ingestionMode).toBe('backfill')
  })

  it('is idempotent — re-running backfill over the same events inserts nothing new', async () => {
    const engine = createPermissionEngine()
    const events: ObservedEvent[] = [
      { source: 'fake', type: 'signup', payload: {}, occurredAt: '2026-01-01T00:00:00Z', externalId: 'a' },
    ]
    const adapter = fakeAdapter(events)

    await engine.ingestEvents(adapter, 'biz_1', 'backfill')
    const second = await engine.ingestEvents(adapter, 'biz_1', 'backfill')

    expect(second).toEqual({ observed: 1, inserted: 0, skipped: 1 })
    expect(await engine.eventStore.listByBusiness('biz_1')).toHaveLength(1)
  })

  it('poll mode calls observe() with a since timestamp and tags events accordingly', async () => {
    const engine = createPermissionEngine()
    const adapter = fakeAdapter(
      [],
      [{ source: 'fake', type: 'signup', payload: {}, occurredAt: '2026-02-01T00:00:00Z', externalId: 'c' }]
    )

    const summary = await engine.ingestEvents(adapter, 'biz_1', 'poll', '2026-01-15T00:00:00Z')
    expect(summary).toEqual({ observed: 1, inserted: 1, skipped: 0 })

    const stored = await engine.eventStore.listByBusiness('biz_1')
    expect(stored[0]?.ingestionMode).toBe('poll')
  })

  it('keeps events isolated per business_id', async () => {
    const engine = createPermissionEngine()
    const adapter = fakeAdapter([
      { source: 'fake', type: 'signup', payload: {}, occurredAt: '2026-01-01T00:00:00Z', externalId: 'a' },
    ])

    await engine.ingestEvents(adapter, 'biz_1', 'backfill')
    await engine.ingestEvents(adapter, 'biz_2', 'backfill')

    expect(await engine.eventStore.listByBusiness('biz_1')).toHaveLength(1)
    expect(await engine.eventStore.listByBusiness('biz_2')).toHaveLength(1)
  })
})

describe('ingestWebhookEvent', () => {
  it('records a single already-verified event, tagged with ingestion_mode webhook', async () => {
    const engine = createPermissionEngine()
    const event: ObservedEvent = {
      source: 'fake',
      type: 'signup',
      payload: { n: 1 },
      occurredAt: '2026-01-01T00:00:00Z',
      externalId: 'a',
    }

    const result = await engine.ingestWebhookEvent('biz_1', event)
    expect(result).toEqual({ inserted: true })

    const stored = await engine.eventStore.listByBusiness('biz_1')
    expect(stored).toHaveLength(1)
    expect(stored[0]?.ingestionMode).toBe('webhook')
  })

  it('is idempotent with the poll/backfill path on the same external_id', async () => {
    const engine = createPermissionEngine()
    const adapter = fakeAdapter([
      { source: 'fake', type: 'signup', payload: {}, occurredAt: '2026-01-01T00:00:00Z', externalId: 'a' },
    ])
    await engine.ingestEvents(adapter, 'biz_1', 'backfill')

    const result = await engine.ingestWebhookEvent('biz_1', {
      source: 'fake',
      type: 'signup',
      payload: {},
      occurredAt: '2026-01-01T00:00:00Z',
      externalId: 'a',
    })
    expect(result).toEqual({ inserted: false })
    expect(await engine.eventStore.listByBusiness('biz_1')).toHaveLength(1)
  })
})
