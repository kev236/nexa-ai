import 'server-only'
import {
  createPermissionEngine,
  createPostgresApprovalStore,
  createPostgresAuditLogStore,
  createPostgresOwnerStore,
  registerSendEmailExecutor,
} from '@nexa-ai/permission-engine'

/**
 * The dashboard's only path to the database — it goes through
 * @nexa-ai/permission-engine's public exports, never through `pg`
 * directly (the import-boundary check at the repo root enforces this;
 * see tools/import-boundary/README.md). One instance per server process.
 */
let engine: ReturnType<typeof createPermissionEngine> | undefined

export function getEngine() {
  if (!engine) {
    engine = createPermissionEngine({
      auditStore: createPostgresAuditLogStore(),
      approvalStore: createPostgresApprovalStore(),
      ownerStore: createPostgresOwnerStore(),
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
  }
  return engine
}
