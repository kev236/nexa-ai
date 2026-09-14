import { describe, expect, it } from 'vitest'
import { createPermissionEngine } from '../src/engine.js'
import type { BusinessAdapter, ObservedTransaction } from '../src/adapters/types.js'

function fakeAdapter(transactions: ObservedTransaction[], hasListTransactions = true): BusinessAdapter {
  return {
    adapterType: 'fake-adapter',
    async backfill() {
      return []
    },
    async observe() {
      return []
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
    ...(hasListTransactions ? { async listTransactions() { return transactions } } : {}),
  }
}

describe('ingestTransactions', () => {
  it('records every observed transaction', async () => {
    const engine = createPermissionEngine()
    const adapter = fakeAdapter([
      { type: 'charge', amountCents: 5000, currency: 'eur', externalRef: 'ch_1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
      { type: 'payout', amountCents: 4000, currency: 'eur', externalRef: 'po_1', status: 'paid', occurredAt: '2026-01-02T00:00:00Z' },
    ])

    const summary = await engine.ingestTransactions(adapter, 'biz_1')
    expect(summary).toEqual({ observed: 2, inserted: 2, skipped: 0 })

    const stored = await engine.transactionStore.listByBusiness('biz_1')
    expect(stored).toHaveLength(2)
    expect(stored[0]?.type).toBe('charge')
  })

  it('is idempotent on externalRef', async () => {
    const engine = createPermissionEngine()
    const transactions: ObservedTransaction[] = [
      { type: 'charge', amountCents: 5000, currency: 'eur', externalRef: 'ch_1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
    ]
    const adapter = fakeAdapter(transactions)

    await engine.ingestTransactions(adapter, 'biz_1')
    const second = await engine.ingestTransactions(adapter, 'biz_1')

    expect(second).toEqual({ observed: 1, inserted: 0, skipped: 1 })
    expect(await engine.transactionStore.listByBusiness('biz_1')).toHaveLength(1)
  })

  it('keeps transactions isolated per business_id', async () => {
    const engine = createPermissionEngine()
    const adapter = fakeAdapter([
      { type: 'charge', amountCents: 5000, currency: 'eur', externalRef: 'ch_1', status: 'succeeded', occurredAt: '2026-01-01T00:00:00Z' },
    ])

    await engine.ingestTransactions(adapter, 'biz_1')
    await engine.ingestTransactions(adapter, 'biz_2')

    expect(await engine.transactionStore.listByBusiness('biz_1')).toHaveLength(1)
    expect(await engine.transactionStore.listByBusiness('biz_2')).toHaveLength(1)
  })

  it('throws a clear error for an adapter with no listTransactions support', async () => {
    const engine = createPermissionEngine()
    const adapter = fakeAdapter([], false)
    await expect(engine.ingestTransactions(adapter, 'biz_1')).rejects.toThrow(/does not support listTransactions/)
  })
})
