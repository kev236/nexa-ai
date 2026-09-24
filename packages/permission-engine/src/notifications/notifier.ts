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
  /**
   * A general "something happened, you didn't have to go check" nudge —
   * not tied to an approval. First use: the cron route telling the owner
   * a new order came in without them opening the dashboard. Optional so
   * every existing Notifier implementation/fake doesn't need updating
   * just to keep compiling; callers use notifier?.notify?.(...).
   */
  notify?(businessId: string, subject: string, text: string): Promise<void>
}
