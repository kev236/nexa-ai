// The businesses that actually use the Campaigns feature today.
// Sproutlight/TrendRush don't run campaign-style marketing through this
// pipeline, so they're deliberately left out rather than building a
// business picker generic enough for "any of forty" — see lib/business.ts's
// own comment on why that generality doesn't exist yet. Dropshipping was
// added once it needed the same content pipeline (organic short-form
// concepts for the Phone Camera Lens Kits niche) — no new agent or store,
// the existing pipeline is already business-generic; this array is purely
// which businesses show up in the dashboard's picker.
export const CAMPAIGN_BUSINESSES = [
  { slug: 'promote-fun', label: 'Promote.fun' },
  { slug: 'nexa-labs', label: 'Nexa Labs' },
  { slug: 'dropshipping', label: 'Dropshipping' },
] as const

export type CampaignBusinessSlug = (typeof CAMPAIGN_BUSINESSES)[number]['slug']

export function isCampaignBusinessSlug(value: string): value is CampaignBusinessSlug {
  return CAMPAIGN_BUSINESSES.some((b) => b.slug === value)
}

const DEFAULT_SLUG: CampaignBusinessSlug = 'promote-fun'

/** Falls back to promote-fun for anything unset/unrecognized — keeps existing /campaigns links working exactly as before this feature became business-aware. */
export function resolveCampaignBusinessSlug(value: string | undefined): CampaignBusinessSlug {
  return value && isCampaignBusinessSlug(value) ? value : DEFAULT_SLUG
}
