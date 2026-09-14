import 'server-only'
import {
  createPermissionEngine,
  createPostgresApprovalStore,
  createPostgresAuditLogStore,
  createPostgresOwnerStore,
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
  }
  return engine
}
