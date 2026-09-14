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
  ingestTransactions,
  ingestWebhookEvent,
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
export type { BusinessRecord, BusinessStore } from './businesses/store.js'
export type { AgentRecord, AgentStore } from './agents/store.js'
export type { TransactionRecord, TransactionInput, TransactionStore } from './transactions/store.js'
export type { ActionDefinition, BusinessAdapter, ObservedEvent, ObservedTransaction } from './adapters/types.js'
export { createPostgresAuditLogStore } from './audit/postgresStore.js'
export { createPostgresApprovalStore } from './approvals/postgresStore.js'
export { createPostgresOwnerStore } from './owners/postgresStore.js'
export { createPostgresEventStore } from './events/postgresStore.js'
export { createPostgresDecisionStore } from './decisions/postgresStore.js'
export { createPostgresBusinessStore } from './businesses/postgresStore.js'
export { createPostgresTransactionStore } from './transactions/postgresStore.js'
export { createPostgresAgentStore } from './agents/postgresStore.js'
export {
  NexaLabsAdapter,
  createNexaLabsAdapter,
  SANITY_WEBHOOK_SIGNATURE_HEADER,
} from './adapters/nexaLabsAdapter.js'
export { triageEvent } from './agents/waitlistTriageAgent.js'
export type { TriageResult } from './agents/waitlistTriageAgent.js'
export { runWaitlistTriageOnce } from './agents/runWaitlistTriage.js'
export type { RunWaitlistTriageOptions, RunWaitlistTriageSummary } from './agents/runWaitlistTriage.js'
export { createAnthropicClient } from './llm/client.js'
export type { MessagesClient } from './llm/client.js'
export { registerSendEmailExecutor } from './executors/sendEmail.js'
export type { Notifier } from './notifications/notifier.js'
export { createEmailNotifier, createResendEmailNotifier } from './notifications/emailNotifier.js'
