import { randomUUID } from 'node:crypto'
import type { TransactionInput, TransactionRecord, TransactionStore } from './store.js'

export class InMemoryTransactionStore implements TransactionStore {
  private records = new Map<string, TransactionRecord>()

  async record(businessId: string, transaction: TransactionInput): Promise<{ id: string; inserted: boolean }> {
    if (transaction.externalRef) {
      const existing = [...this.records.values()].find(
        (r) => r.businessId === businessId && r.externalRef === transaction.externalRef
      )
      if (existing) return { id: existing.id, inserted: false }
    }

    const id = randomUUID()
    this.records.set(id, {
      id,
      businessId,
      decisionId: transaction.decisionId,
      type: transaction.type,
      amountCents: transaction.amountCents,
      currency: transaction.currency,
      externalRef: transaction.externalRef,
      status: transaction.status,
      createdAt: transaction.occurredAt,
    })
    return { id, inserted: true }
  }

  async listByBusiness(businessId: string, limit = 100): Promise<TransactionRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
  }

  async listUnreviewed(businessId: string, limit = 100): Promise<TransactionRecord[]> {
    return [...this.records.values()]
      .filter((r) => r.businessId === businessId && r.decisionId === undefined)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
  }

  async linkDecision(transactionId: string, decisionId: string): Promise<void> {
    const record = this.records.get(transactionId)
    if (!record) throw new Error(`no transaction record for id ${transactionId}`)
    record.decisionId = decisionId
  }
}
