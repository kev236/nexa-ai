// Registers the 'noop' executor as a side effect. No other executor
// registration happens here — real executors are wired by a future
// bootstrap module inside this same package, never from outside it.
import './executors/noop.js'

export {
  requestAction,
  resolveApproval,
  listPendingApprovals,
  verifyOwnerCredentials,
  ingestEvents,
  createPermissionEngine,
} from './engine.js'
export type { PermissionEngine, PermissionEngineDeps, IngestSummary } from './engine.js'
export type { ActionRequest, ActionOutcome } from './types.js'
export type { JsonValue } from './json.js'
export type { AuditLogRecord, AuditLogStore } from './audit/store.js'
export type { ApprovalRecord, ApprovalStore } from './approvals/store.js'
export type { OwnerRecord, OwnerStore } from './owners/store.js'
export type { EventRecord, EventStore } from './events/store.js'
export type { DecisionRecord, DecisionInput, DecisionStore } from './decisions/store.js'
export type { BusinessStore } from './businesses/store.js'
export type { ActionDefinition, BusinessAdapter, ObservedEvent } from './adapters/types.js'
export { createPostgresAuditLogStore } from './audit/postgresStore.js'
export { createPostgresApprovalStore } from './approvals/postgresStore.js'
export { createPostgresOwnerStore } from './owners/postgresStore.js'
export { createPostgresEventStore } from './events/postgresStore.js'
export { createPostgresDecisionStore } from './decisions/postgresStore.js'
export { createPostgresBusinessStore } from './businesses/postgresStore.js'
export { NexaLabsAdapter, createNexaLabsAdapter } from './adapters/nexaLabsAdapter.js'
export { triageEvent } from './agents/waitlistTriageAgent.js'
export type { TriageResult } from './agents/waitlistTriageAgent.js'
export { createAnthropicClient } from './llm/client.js'
export type { MessagesClient } from './llm/client.js'
export { registerSendEmailExecutor } from './executors/sendEmail.js'
