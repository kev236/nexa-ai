import type { JsonValue } from './json.js'

export type ActionRequest = {
  businessId: string
  agentId: string
  actionType: string
  payload: JsonValue
  reasoning: string
  expectedResult: JsonValue
  expectedCost?: { amountCents: number; currency: string }
  /** Step 11: how sure the agent is this draft is send-ready, 0 to 1. Feeds autonomy level 2's auto-approve gate — see engine.ts. */
  confidence?: number
}

export type ActionOutcome =
  | { status: 'executed'; auditId: string; result: JsonValue }
  | { status: 'denied'; auditId: string; reason: string }
  | { status: 'pending_approval'; auditId: string; approvalId: string }
