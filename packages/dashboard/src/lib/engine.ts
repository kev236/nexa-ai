import 'server-only'
import {
  createPermissionEngine,
  createPostgresAgentStore,
  createPostgresApprovalStore,
  createPostgresAuditLogStore,
  createPostgresBusinessStore,
  createPostgresCampaignStore,
  createPostgresClipStore,
  createPostgresContentConceptStore,
  createPostgresDecisionStore,
  createPostgresEventStore,
  createPostgresOAuthCredentialStore,
  createPostgresOpportunityStore,
  createPostgresOwnerStore,
  createPostgresSocialAccountStore,
  createPostgresStoryConceptStore,
  createPostgresTransactionStore,
  createResendEmailNotifier,
  registerSendEmailExecutor,
  registerProposeOpportunityExecutor,
  registerPostClipYoutubeExecutor,
  registerPostStoryConceptYoutubeExecutor,
  registerPostClipInstagramExecutor,
  registerPostClipTiktokExecutor,
  createPostgresApiKeyStore,
  type ApiKeyStore,
  createPostgresApiKeyRequestStore,
  type ApiKeyRequestStore,
} from '@nexa-ai/permission-engine'

/**
 * The dashboard's only path to the database — it goes through
 * @nexa-ai/permission-engine's public exports, never through `pg`
 * directly (the import-boundary check at the repo root enforces this;
 * see tools/import-boundary/README.md). One instance per server process.
 *
 * Every store is Postgres-backed here, not just the three the
 * approvals page originally needed — a Vercel serverless function gets
 * a fresh process per invocation (or close to it), so the in-memory
 * default stores createPermissionEngine() falls back to would silently
 * lose every event/decision/transaction between cron runs. That gap
 * existed from step 6 through step 8's first pass — caught by actually
 * running the cron route locally against a real Postgres database
 * rather than assuming the wiring was already there.
 */
let engine: ReturnType<typeof createPermissionEngine> | undefined

export function getEngine() {
  if (!engine) {
    const ownerStore = createPostgresOwnerStore()
    const businessStore = createPostgresBusinessStore()
    const opportunityStore = createPostgresOpportunityStore()

    engine = createPermissionEngine({
      auditStore: createPostgresAuditLogStore(),
      approvalStore: createPostgresApprovalStore(),
      ownerStore,
      eventStore: createPostgresEventStore(),
      decisionStore: createPostgresDecisionStore(),
      transactionStore: createPostgresTransactionStore(),
      businessStore,
      agentStore: createPostgresAgentStore(),
      opportunityStore,
      campaignStore: createPostgresCampaignStore(),
      contentConceptStore: createPostgresContentConceptStore(),
      storyConceptStore: createPostgresStoryConceptStore(),
      socialAccountStore: createPostgresSocialAccountStore(),
      clipStore: createPostgresClipStore(),
      oauthCredentialStore: createPostgresOAuthCredentialStore(),
      // Step 10: caught below, not thrown — see the send_email note.
      notifier: tryCreateNotifier(ownerStore, businessStore),
    })
    // The executor registry is per-process and in-memory — the dashboard
    // is a separate process from db/runWaitlistTriage.mjs, so it must
    // register 'send_email' itself for its own Approve button to work.
    // Caught, not thrown: a missing RESEND_API_KEY shouldn't take down
    // login or the approval queue — it should just leave 'send_email'
    // unregistered, which resolveApproval already treats as a safe
    // denial (see engine.ts), not a crash.
    try {
      registerSendEmailExecutor()
    } catch (err) {
      console.error('send_email executor not registered:', err instanceof Error ? err.message : err)
    }
    // Step 17: never throws (no external credentials needed), so no
    // try/catch — unlike send_email, there's no "unconfigured" state.
    registerProposeOpportunityExecutor(opportunityStore)
    // Step 27: same "missing env vars is an expected state, not a crash"
    // shape as send_email above — a business without YouTube publish
    // credentials configured just leaves 'post_clip_youtube' unregistered.
    try {
      registerPostClipYoutubeExecutor()
    } catch (err) {
      console.error('post_clip_youtube executor not registered:', err instanceof Error ? err.message : err)
    }
    // Sproutlight's equivalent — same "missing env vars is expected"
    // shape. Both executors share the same YOUTUBE_OAUTH_CLIENT_ID/
    // SECRET; each business's own oauth_credentials row (not these env
    // vars) is what makes posting fail closed per-business until that
    // business's owner actually connects its channel.
    try {
      registerPostStoryConceptYoutubeExecutor()
    } catch (err) {
      console.error('post_story_concept_youtube executor not registered:', err instanceof Error ? err.message : err)
    }
    // Step 29: TrendRush's Instagram and TikTok posting — same "missing
    // env vars is expected, not a crash" shape as the YouTube executors
    // above. Each stays unregistered (and its clip-page button hidden)
    // until the owner sets that platform's own credentials.
    try {
      registerPostClipInstagramExecutor()
    } catch (err) {
      console.error('post_clip_instagram executor not registered:', err instanceof Error ? err.message : err)
    }
    try {
      registerPostClipTiktokExecutor()
    } catch (err) {
      console.error('post_clip_tiktok executor not registered:', err instanceof Error ? err.message : err)
    }
  }
  return engine
}

/**
 * Step 30: the clip-scoring API product's key store — not part of
 * PermissionEngineDeps since it isn't business-scoped (see migration
 * 0024's own comment), so it gets its own small singleton rather than
 * forcing every engine consumer to carry a store it mostly won't use.
 */
let apiKeyStore: ApiKeyStore | undefined

export function getApiKeyStore(): ApiKeyStore {
  if (!apiKeyStore) {
    apiKeyStore = createPostgresApiKeyStore()
  }
  return apiKeyStore
}

let apiKeyRequestStore: ApiKeyRequestStore | undefined

/** Step 31: the public /clip-api landing page's request-access inbox — same standalone reasoning as getApiKeyStore() above. */
export function getApiKeyRequestStore(): ApiKeyRequestStore {
  if (!apiKeyRequestStore) {
    apiKeyRequestStore = createPostgresApiKeyRequestStore()
  }
  return apiKeyRequestStore
}

function tryCreateNotifier(
  ownerStore: ReturnType<typeof createPostgresOwnerStore>,
  businessStore: ReturnType<typeof createPostgresBusinessStore>
) {
  try {
    return createResendEmailNotifier(ownerStore, businessStore)
  } catch (err) {
    // Same shape as the executor above — a missing RESEND_API_KEY means
    // no notifications, not a broken dashboard. requestAction() already
    // treats an unconfigured notifier as "nothing to do here."
    console.error('email notifier not configured:', err instanceof Error ? err.message : err)
    return undefined
  }
}
