import type { JsonValue } from '../json.js'
import type { BrowserActionClient, BrowserActionType, BrowserTargetRole } from '../adapters/browserActionAdapter.js'
import { createPlaywrightBrowserActionClient } from '../adapters/browserActionAdapter.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

const ACTION_TYPES: BrowserActionType[] = ['click', 'fill', 'check']
const TARGET_ROLES: BrowserTargetRole[] = ['button', 'link', 'textbox', 'checkbox']

type BrowserActionPayload = {
  url: string
  actionType: BrowserActionType
  targetRole: BrowserTargetRole
  targetName: string
  value?: string
}

function assertPayload(payload: JsonValue): BrowserActionPayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TypeError('browser_action payload must be an object')
  }
  const p = payload as Record<string, unknown>
  if (typeof p.url !== 'string' || !p.url) throw new TypeError('browser_action payload missing url')
  if (typeof p.actionType !== 'string' || !ACTION_TYPES.includes(p.actionType as BrowserActionType)) {
    throw new TypeError(`browser_action payload actionType must be one of ${ACTION_TYPES.join(', ')}`)
  }
  if (typeof p.targetRole !== 'string' || !TARGET_ROLES.includes(p.targetRole as BrowserTargetRole)) {
    throw new TypeError(`browser_action payload targetRole must be one of ${TARGET_ROLES.join(', ')}`)
  }
  if (typeof p.targetName !== 'string' || !p.targetName) {
    throw new TypeError('browser_action payload missing targetName')
  }
  if (p.actionType === 'fill' && (typeof p.value !== 'string' || !p.value)) {
    throw new TypeError('browser_action payload with actionType "fill" must include a non-empty value')
  }
  return {
    url: p.url,
    actionType: p.actionType as BrowserActionType,
    targetRole: p.targetRole as BrowserTargetRole,
    targetName: p.targetName,
    value: typeof p.value === 'string' ? p.value : undefined,
  }
}

/**
 * The execute half of plan-then-approve-then-execute (see
 * browserActionAdapter.ts's own comment). Every request reaching this
 * has already gone through requestAction() with requiresReview: true —
 * shouldAutoApprove() never lets this class of action through on its
 * own, so this function only ever runs after a real owner Approve click
 * on the exact payload shown in the approval queue. No re-planning
 * happens here — the url/action/target/value are replayed exactly as
 * approved, never re-derived.
 */
export function createBrowserActionExecutor(client: BrowserActionClient): ExecutorFn {
  return async (payload) => {
    const input = assertPayload(payload)
    const result = await client.performAction(input)
    return { resultUrl: result.resultUrl, resultSummary: result.resultSummary }
  }
}

export function registerBrowserActionExecutor(): void {
  registerExecutor('browser_action', createBrowserActionExecutor(createPlaywrightBrowserActionClient()))
}
