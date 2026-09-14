import type { JsonValue } from '../json.js'

/**
 * Only what an executor needs so far: a business's own config (e.g.
 * config.emailFrom), never hardcoded in executor code per this project's
 * own invariant against business specifics in core code. Grows if a
 * second thing ever needs a business row (name, status, ...).
 */
export interface BusinessStore {
  getConfig(businessId: string): Promise<JsonValue>
}
