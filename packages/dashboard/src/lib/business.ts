import 'server-only'
import { getEngine } from './engine'

// The dashboard is single-tenant per page area today — there's no
// business-switcher UI, the same way listPendingApprovals() already
// returns every business's approvals unscoped. The plan doc's own
// invariant #4 says to write everything else "as though there are
// forty" businesses; this file is the one place that honestly isn't —
// every page resolves "the" business through this one function instead
// of each repeating a slug, so if/when the dashboard grows real
// per-business scoping (a switcher, scoped nav), this is the only place
// that changes. Matches the same default already used by
// db/runWaitlistTriage.mjs and db/backfillNexaLabs.mjs.
const DEFAULT_BUSINESS_SLUG = 'nexa-labs'

export async function getBusiness(slug: string = DEFAULT_BUSINESS_SLUG) {
  const business = await getEngine().businessStore.getBySlug(slug)
  if (!business) {
    throw new Error(`no business with slug '${slug}' — run db:seed or db:register-business first`)
  }
  return business
}

// Step 16: Promote.fun campaigns are a second, real business
// (db:register-business promote-fun "..."), not the marketing site's
// own — the Campaigns pages resolve this one explicitly rather than
// falling back to getBusiness()'s nexa-labs default.
export async function getPromoteFunBusiness() {
  return getBusiness('promote-fun')
}

// Step 19: Sproutlight — a third business (db:register-business
// sproutlight "..."), same reasoning as getPromoteFunBusiness().
export async function getSproutlightBusiness() {
  return getBusiness('sproutlight')
}

// Step 20: TrendRush — a fourth business (db:register-business
// trendrush "..."), same reasoning as getPromoteFunBusiness(). The one
// Promote.fun cares about for the Growth page's eligibility badge — see
// app/growth/page.tsx.
export async function getTrendRushBusiness() {
  return getBusiness('trendrush')
}
