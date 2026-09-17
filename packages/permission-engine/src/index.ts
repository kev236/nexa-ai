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
  reapAbandonedRequests,
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
export type { OpportunityRecord, OpportunityInput, OpportunityStore } from './opportunities/store.js'
export type { OpportunityScores } from './opportunities/scoring.js'
export type { CampaignRecord, CampaignInput, CampaignStore } from './campaigns/store.js'
export type { ContentConceptRunRecord, ContentConceptRunInput, ContentConceptStore } from './contentConcepts/store.js'
export type { ContentConcept, ContentConceptScore, ContentAngle } from './contentConcepts/types.js'
export { computeConceptScore } from './contentConcepts/types.js'
export type { StoryConceptRecord, StoryConceptInput, StoryConceptStore, StoryScene } from './storyConcepts/store.js'
export type { SocialAccountRecord, SocialAccountStore, Platform } from './socialAccounts/store.js'
export { PLATFORMS } from './socialAccounts/store.js'
export type { ClipRecord, ClipInput, ClipStore, ClipCaption } from './clips/store.js'
export { SCORE_DIMENSIONS, computeTotalScore } from './opportunities/scoring.js'
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
export { createPostgresOpportunityStore } from './opportunities/postgresStore.js'
export { createPostgresCampaignStore } from './campaigns/postgresStore.js'
export { createPostgresContentConceptStore } from './contentConcepts/postgresStore.js'
export { createPostgresStoryConceptStore } from './storyConcepts/postgresStore.js'
export { createPostgresSocialAccountStore } from './socialAccounts/postgresStore.js'
export { createPostgresClipStore } from './clips/postgresStore.js'
export {
  NexaLabsAdapter,
  createNexaLabsAdapter,
  SANITY_WEBHOOK_SIGNATURE_HEADER,
} from './adapters/nexaLabsAdapter.js'
export { createYouTubeHttpClient, fetchYouTubeSubscriberCount } from './adapters/youtubeAdapter.js'
export type { YouTubeClient, YouTubeChannelStats } from './adapters/youtubeAdapter.js'
export { triageEvent } from './agents/waitlistTriageAgent.js'
export type { TriageResult } from './agents/waitlistTriageAgent.js'
export { runWaitlistTriageOnce } from './agents/runWaitlistTriage.js'
export type { RunWaitlistTriageOptions, RunWaitlistTriageSummary } from './agents/runWaitlistTriage.js'
export { normalizeCampaign } from './agents/campaignAgent.js'
export type { CampaignNormalizationResult } from './agents/campaignAgent.js'
export { generateContentConcepts } from './agents/creativeAgent.js'
export type { CreativeGenerationResult } from './agents/creativeAgent.js'
export { importCampaignOnce } from './agents/runCampaignImport.js'
export type { ImportCampaignResult } from './agents/runCampaignImport.js'
export { generateConceptsOnce } from './agents/runCreativeGeneration.js'
export type { RunCreativeGenerationOptions, GenerateConceptsResult } from './agents/runCreativeGeneration.js'
export { reviewTransaction } from './agents/transactionReviewAgent.js'
export type { TransactionReviewResult } from './agents/transactionReviewAgent.js'
export { runTransactionReviewOnce } from './agents/runTransactionReview.js'
export type { RunTransactionReviewOptions, RunTransactionReviewSummary } from './agents/runTransactionReview.js'
export { createAnthropicClient } from './llm/client.js'
export type { MessagesClient } from './llm/client.js'
export { registerSendEmailExecutor } from './executors/sendEmail.js'
export { registerProposeOpportunityExecutor } from './executors/proposeOpportunity.js'
export { discoverOpportunities } from './agents/opportunityDiscoveryAgent.js'
export type { OpportunityProposal, OpportunityDiscoveryResult } from './agents/opportunityDiscoveryAgent.js'
export { runOpportunityDiscoveryOnce } from './agents/runOpportunityDiscovery.js'
export type { RunOpportunityDiscoveryOptions, RunOpportunityDiscoveryResult } from './agents/runOpportunityDiscovery.js'
export { generateStoryConcept } from './agents/storyConceptAgent.js'
export type { StoryConceptGenerationResult } from './agents/storyConceptAgent.js'
export { generateStoryConceptOnce } from './agents/runStoryConceptGeneration.js'
export type { RunStoryConceptGenerationOptions, GenerateStoryConceptResult } from './agents/runStoryConceptGeneration.js'
export { evaluateClip } from './agents/clipDiscoveryAgent.js'
export type { ClipEvaluationResult } from './agents/clipDiscoveryAgent.js'
export { discoverClipOnce } from './agents/runClipDiscovery.js'
export type { RunClipDiscoveryOptions, DiscoverClipResult } from './agents/runClipDiscovery.js'
export type { Notifier } from './notifications/notifier.js'
export { createEmailNotifier, createResendEmailNotifier } from './notifications/emailNotifier.js'
