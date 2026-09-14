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
}
