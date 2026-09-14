// Registers the 'noop' executor as a side effect. No other executor
// registration happens here — real executors are wired by a future
// bootstrap module inside this same package, never from outside it.
import './executors/noop.js'

export {
  requestAction,
  resolveApproval,
  listPendingApprovals,
  verifyOwnerCredentials,
  createPermissionEngine,
} from './engine.js'
export type { PermissionEngine, PermissionEngineDeps } from './engine.js'
export type { ActionRequest, ActionOutcome } from './types.js'
export type { JsonValue } from './json.js'
export type { AuditLogRecord, AuditLogStore } from './audit/store.js'
export type { ApprovalRecord, ApprovalStore } from './approvals/store.js'
export type { OwnerRecord, OwnerStore } from './owners/store.js'
export { createPostgresAuditLogStore } from './audit/postgresStore.js'
export { createPostgresApprovalStore } from './approvals/postgresStore.js'
export { createPostgresOwnerStore } from './owners/postgresStore.js'
