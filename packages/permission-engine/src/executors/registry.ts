import type { JsonValue } from '../json.js'

/**
 * Not exported from this package (see package.json#exports and README.md).
 * An executor is the only code allowed to turn an approved ActionRequest
 * into a real side effect — it's constructed here, with credentials
 * injected at this layer, never handed to agent code. Registration is
 * only ever called from within this package (this file, or a future
 * bootstrap module in this same src/ tree that wires real adapters) —
 * never expose registerExecutor from index.ts.
 */
export type ExecutorFn = (
  payload: JsonValue,
  context: { businessId: string; agentId: string }
) => Promise<JsonValue>

const registry = new Map<string, ExecutorFn>()

export function registerExecutor(actionType: string, fn: ExecutorFn): void {
  registry.set(actionType, fn)
}

export function getExecutor(actionType: string): ExecutorFn | undefined {
  return registry.get(actionType)
}
