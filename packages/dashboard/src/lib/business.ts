import 'server-only'
import { getEngine } from './engine'

// The dashboard is single-tenant today — there's no business-selection
// UI anywhere in it, the same way listPendingApprovals() already
// returns every business's approvals unscoped. The plan doc's own
// invariant #4 says to write everything else "as though there are
// forty" businesses; this file is the one place that honestly isn't —
// every page resolves "the" business through this one function instead
// of each repeating the slug, so if/when the dashboard grows real
// per-business scoping, this is the only place that changes. Matches
// the same default already used by db/runWaitlistTriage.mjs and
// db/backfillNexaLabs.mjs, not a new simplification.
const BUSINESS_SLUG = 'nexa-labs'

export async function getBusiness() {
  const business = await getEngine().businessStore.getBySlug(BUSINESS_SLUG)
  if (!business) {
    throw new Error(`no business with slug '${BUSINESS_SLUG}' — run db:seed first`)
  }
  return business
}
