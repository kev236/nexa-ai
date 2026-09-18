export type TransactionRecord = {
  id: string
  businessId: string
  decisionId?: string
  type: 'charge' | 'refund' | 'payout'
  amountCents: number
  currency: string
  externalRef?: string
  status: string
  createdAt: string
}

export type TransactionInput = {
  decisionId?: string
  type: 'charge' | 'refund' | 'payout'
  amountCents: number
  currency: string
  externalRef?: string
  status: string
  occurredAt: string
}

export interface TransactionStore {
  /** Idempotent on (business_id, externalRef) — inserted:false means it was already there. */
  record(businessId: string, transaction: TransactionInput): Promise<{ id: string; inserted: boolean }>
  listByBusiness(businessId: string, limit?: number): Promise<TransactionRecord[]>
  /** Step 14: transactions with no decision_id yet — the transaction-review agent's queue, oldest first. Mirrors DecisionStore.hasDecisionForEvent()'s idempotency role, but inverted (decision_id lives on this row, not on a separate lookup) since a transaction is reviewed after the fact, not linked at ingest time. */
  listUnreviewed(businessId: string, limit?: number): Promise<TransactionRecord[]>
  /** Step 14: records that a decision now exists about this transaction, so it drops out of listUnreviewed(). */
  linkDecision(transactionId: string, decisionId: string): Promise<void>
}
