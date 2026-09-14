import type { JsonValue } from './json.js'

export type ActionRequest = {
  businessId: string
  agentId: string
  actionType: string
  payload: JsonValue
  reasoning: string
  expectedResult: JsonValue
  expectedCost?: { amountCents: number; currency: string }
}

export type ActionOutcome =
  | { status: 'executed'; auditId: string; result: JsonValue }
  | { status: 'denied'; auditId: string; reason: string }
  | { status: 'pending_approval'; auditId: string; approvalId: string }
