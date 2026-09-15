import { assertJsonValue } from './json.js'
import type { ActionRequest } from './types.js'

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`)
  }
}

/**
 * Structural validation of the ActionRequest shape itself — this is what
 * makes "the payload can only ever be data" an enforced runtime property,
 * not just a TypeScript-time hint a caller can ignore. A caller passing a
 * live database client or HTTP handle as `payload` fails here, before the
 * request ever reaches the audit log.
 */
export function assertActionRequest(request: unknown): asserts request is ActionRequest {
  if (typeof request !== 'object' || request === null) {
    throw new TypeError('ActionRequest must be an object')
  }
  const r = request as Record<string, unknown>

  assertNonEmptyString(r.businessId, 'ActionRequest.businessId')
  assertNonEmptyString(r.agentId, 'ActionRequest.agentId')
  assertNonEmptyString(r.actionType, 'ActionRequest.actionType')
  assertNonEmptyString(r.reasoning, 'ActionRequest.reasoning')

  assertJsonValue(r.payload, 'ActionRequest.payload')
  assertJsonValue(r.expectedResult, 'ActionRequest.expectedResult')

  if (r.expectedCost !== undefined) {
    if (typeof r.expectedCost !== 'object' || r.expectedCost === null) {
      throw new TypeError('ActionRequest.expectedCost must be an object when present')
    }
    const cost = r.expectedCost as Record<string, unknown>
    if (typeof cost.amountCents !== 'number' || !Number.isFinite(cost.amountCents)) {
      throw new TypeError('ActionRequest.expectedCost.amountCents must be a finite number')
    }
    assertNonEmptyString(cost.currency, 'ActionRequest.expectedCost.currency')
  }

  if (r.confidence !== undefined) {
    if (typeof r.confidence !== 'number' || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1) {
      throw new TypeError('ActionRequest.confidence must be a finite number between 0 and 1 when present')
    }
  }
}
