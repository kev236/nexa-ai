import type { ActionRequest } from '../types.js'

/**
 * Step 10: the engine's one hook for "an owner needs to know something
 * is waiting." Deliberately not "list owners and send an email" at the
 * engine.ts call site — that would put a credentialed HTTP client
 * inside core, the same thing invariant #1 keeps out of agent code.
 * Concrete implementations (e.g. EmailNotifier) live in this directory,
 * same boundary as executors and adapters.
 */
export interface Notifier {
  notifyPendingApproval(request: ActionRequest, approvalId: string): Promise<void>
}
