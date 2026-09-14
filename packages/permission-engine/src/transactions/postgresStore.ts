import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { TransactionInput, TransactionRecord, TransactionStore } from './store.js'

type Row = {
  id: string
  business_id: string
  decision_id: string | null
  type: TransactionRecord['type']
  amount_cents: string
  currency: string
  external_ref: string | null
  status: string
  created_at: string
}

function toRecord(row: Row): TransactionRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    decisionId: row.decision_id ?? undefined,
    type: row.type,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    externalRef: row.external_ref ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  }
}

export class PostgresTransactionStore implements TransactionStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async record(
    businessId: string,
    transaction: TransactionInput
  ): Promise<{ id: string; inserted: boolean }> {
    const result = await this.pool.query<{ id: string; inserted: boolean }>(
      `INSERT INTO transactions (business_id, decision_id, type, amount_cents, currency, external_ref, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (business_id, external_ref) WHERE external_ref IS NOT NULL DO NOTHING
       RETURNING id, true AS inserted`,
      [
        businessId,
        transaction.decisionId ?? null,
        transaction.type,
        transaction.amountCents,
        transaction.currency,
        transaction.externalRef ?? null,
        transaction.status,
        transaction.occurredAt,
      ]
    )
    if (result.rows[0]) return result.rows[0]

    // Conflict hit — the row already exists; look it up so callers always get an id.
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM transactions WHERE business_id = $1 AND external_ref = $2`,
      [businessId, transaction.externalRef]
    )
    const id = existing.rows[0]?.id
    if (!id) throw new Error('transactions insert conflicted but no existing row was found')
    return { id, inserted: false }
  }

  async listByBusiness(businessId: string, limit = 100): Promise<TransactionRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM transactions WHERE business_id = $1 ORDER BY created_at ASC LIMIT $2`,
      [businessId, limit]
    )
    return result.rows.map(toRecord)
  }
}

export function createPostgresTransactionStore(): TransactionStore {
  return new PostgresTransactionStore()
}
