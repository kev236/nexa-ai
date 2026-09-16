import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getTrendRushBusiness, getSproutlightBusiness } from '@/lib/business'
import { Nav } from '@/components/Nav'
import { updateFollowerCount } from './actions'
import { PLATFORMS, type BusinessRecord, type Platform, type SocialAccountRecord } from '@nexa-ai/permission-engine'

export const dynamic = 'force-dynamic'

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

// The real Promote.fun rule the owner set: an account needs at least
// this many followers on every one of the three platforms before
// Promote.fun will let it join or run a paid campaign. TrendRush is the
// account working toward that; Sproutlight tracks the same shape of
// data without this framing — it isn't seeking Promote.fun campaigns.
const CAMPAIGN_ELIGIBILITY_THRESHOLD = 200

async function loadSection(loader: () => Promise<BusinessRecord>) {
  try {
    const business = await loader()
    const accounts = await getEngine().socialAccountStore.listByBusiness(business.id)
    return { business, accounts }
  } catch {
    return undefined
  }
}

export default async function GrowthPage() {
  await verifySession()

  const [trendRush, sproutlight] = await Promise.all([
    loadSection(getTrendRushBusiness),
    loadSection(getSproutlightBusiness),
  ])

  return (
    <>
      <Nav active="growth" />
      <div className="page-header">
        <h1>Growth</h1>
        <p className="subtitle">
          Real follower counts, updated by hand as each account grows. Promote.fun requires{' '}
          {CAMPAIGN_ELIGIBILITY_THRESHOLD}+ followers on YouTube, Instagram, and TikTok before an account can
          join or run a paid campaign.
        </p>
      </div>

      {!trendRush && !sproutlight ? (
        <p className="empty">
          No growth-tracked businesses set up yet — run db:register-business for trendrush and/or sproutlight
          first.
        </p>
      ) : (
        <>
          {trendRush && (
            <GrowthSection
              title="TrendRush"
              meta="clip reposting"
              business={trendRush.business}
              accounts={trendRush.accounts}
              eligibilityThreshold={CAMPAIGN_ELIGIBILITY_THRESHOLD}
            />
          )}
          {sproutlight && (
            <GrowthSection
              title="Sproutlight"
              meta="kids' content"
              business={sproutlight.business}
              accounts={sproutlight.accounts}
            />
          )}
        </>
      )}
    </>
  )
}

function GrowthSection({
  title,
  meta,
  business,
  accounts,
  eligibilityThreshold,
}: {
  title: string
  meta: string
  business: BusinessRecord
  accounts: SocialAccountRecord[]
  eligibilityThreshold?: number
}) {
  const byPlatform = new Map(accounts.map((a) => [a.platform, a]))
  const eligible =
    eligibilityThreshold !== undefined
      ? PLATFORMS.every((p) => (byPlatform.get(p)?.followerCount ?? 0) >= eligibilityThreshold)
      : undefined

  return (
    <section>
      <div className="card-header">
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          {title} <span className="meta">— {meta}</span>
        </h2>
        {eligible !== undefined && (
          <span className={eligible ? 'status-badge status-active' : 'status-badge status-requested'}>
            {eligible ? 'promote.fun eligible' : 'not eligible yet'}
          </span>
        )}
      </div>

      <div className="growth-grid">
        {PLATFORMS.map((platform) => {
          const account = byPlatform.get(platform)
          const count = account?.followerCount ?? 0
          const pct = eligibilityThreshold ? Math.min(100, (count / eligibilityThreshold) * 100) : undefined
          const met = eligibilityThreshold !== undefined && count >= eligibilityThreshold

          return (
            <div className="growth-card" key={platform}>
              <div className="growth-card-header">
                <span className="growth-platform">{PLATFORM_LABELS[platform]}</span>
                {account?.handle && <span className="meta mono">@{account.handle}</span>}
              </div>

              <div className="growth-count">
                {count.toLocaleString()}
                {eligibilityThreshold !== undefined && <span className="meta"> / {eligibilityThreshold}</span>}
              </div>

              {pct !== undefined && (
                <div className="growth-progress-track">
                  <div
                    className={met ? 'growth-progress-fill growth-progress-fill--met' : 'growth-progress-fill'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}

              <form action={updateFollowerCount.bind(null, business.id)} className="growth-form">
                <input type="hidden" name="platform" value={platform} />
                <input
                  type="number"
                  name="followerCount"
                  min={0}
                  step={1}
                  defaultValue={count}
                  aria-label={`${PLATFORM_LABELS[platform]} follower count`}
                  required
                />
                <input
                  type="text"
                  name="handle"
                  defaultValue={account?.handle ?? ''}
                  placeholder="@handle"
                  aria-label={`${PLATFORM_LABELS[platform]} handle`}
                />
                <button type="submit">Update</button>
              </form>
            </div>
          )
        })}
      </div>
    </section>
  )
}
