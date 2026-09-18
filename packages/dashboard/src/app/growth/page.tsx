import { TrendingUp } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getTrendRushBusiness, getSproutlightBusiness } from '@/lib/business'
import { gaugeCircumference, gaugeDashoffset } from '@/lib/radialGauge'
import { Nav } from '@/components/Nav'
import { EmptyState } from '@/components/EmptyState'
import { AnimatedNumber } from '@/components/AnimatedNumber'
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

// A ring, not a bar — the gauge geometry is fixed to the SVG viewBox
// below (viewBox="0 0 100 100", r=42), so this radius must move
// together with that markup if either changes.
const GAUGE_RADIUS = 42
const GAUGE_CIRCUMFERENCE = gaugeCircumference(GAUGE_RADIUS)

async function loadSection(loader: () => Promise<BusinessRecord>) {
  try {
    const business = await loader()
    const engine = getEngine()
    const [accounts, youtubeOAuth] = await Promise.all([
      engine.socialAccountStore.listByBusiness(business.id),
      engine.oauthCredentialStore.get(business.id, 'youtube'),
    ])
    return { business, accounts, youtubeConnected: youtubeOAuth !== undefined }
  } catch {
    return undefined
  }
}

export default async function GrowthPage({
  searchParams,
}: {
  searchParams: Promise<{ youtube_connected?: string }>
}) {
  await verifySession()
  const { youtube_connected } = await searchParams

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

      {youtube_connected === '1' && (
        <p className="status-badge status-active" style={{ marginBottom: '1rem', display: 'inline-block' }}>
          YouTube connected — publish access is authorized once verification completes.
        </p>
      )}

      {!trendRush && !sproutlight ? (
        <EmptyState
          icon={TrendingUp}
          title="No growth-tracked businesses set up yet"
          hint={
            <>
              run <code className="mono">db:register-business</code> for trendrush and/or sproutlight first
            </>
          }
        />
      ) : (
        <>
          {trendRush && (
            <GrowthSection
              title="TrendRush"
              meta="clip reposting"
              business={trendRush.business}
              accounts={trendRush.accounts}
              youtubeConnected={trendRush.youtubeConnected}
              eligibilityThreshold={CAMPAIGN_ELIGIBILITY_THRESHOLD}
              delay={0.05}
            />
          )}
          {sproutlight && (
            <GrowthSection
              title="Sproutlight"
              meta="kids' content"
              business={sproutlight.business}
              accounts={sproutlight.accounts}
              youtubeConnected={sproutlight.youtubeConnected}
              delay={0.15}
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
  youtubeConnected,
  eligibilityThreshold,
  delay = 0,
}: {
  title: string
  meta: string
  business: BusinessRecord
  accounts: SocialAccountRecord[]
  youtubeConnected: boolean
  eligibilityThreshold?: number
  delay?: number
}) {
  const byPlatform = new Map(accounts.map((a) => [a.platform, a]))
  const eligible =
    eligibilityThreshold !== undefined
      ? PLATFORMS.every((p) => (byPlatform.get(p)?.followerCount ?? 0) >= eligibilityThreshold)
      : undefined

  return (
    <section className="deck-enter" style={{ animationDelay: `${delay}s` }}>
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

              {platform === 'youtube' &&
                (youtubeConnected ? (
                  <span className="status-badge status-active" style={{ marginBottom: '0.5rem' }}>
                    Publish access connected
                  </span>
                ) : (
                  <a
                    href={`/api/oauth/youtube/start?business=${business.slug}`}
                    className="status-badge status-requested"
                    style={{ marginBottom: '0.5rem', textDecoration: 'none' }}
                  >
                    Connect YouTube for publishing
                  </a>
                ))}

              {pct !== undefined ? (
                <div className="growth-gauge">
                  <svg viewBox="0 0 100 100" className="growth-gauge-svg" role="img" aria-label={`${count} of ${eligibilityThreshold} followers`}>
                    <circle cx="50" cy="50" r={GAUGE_RADIUS} className="growth-gauge-track" />
                    <circle
                      cx="50"
                      cy="50"
                      r={GAUGE_RADIUS}
                      className={met ? 'growth-gauge-fill growth-gauge-fill--met' : 'growth-gauge-fill'}
                      strokeDasharray={GAUGE_CIRCUMFERENCE}
                      strokeDashoffset={gaugeDashoffset(pct, GAUGE_CIRCUMFERENCE)}
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="growth-gauge-label">
                    <span className="growth-count">
                      <AnimatedNumber value={count} />
                    </span>
                    <span className="meta">/ {eligibilityThreshold}</span>
                  </div>
                </div>
              ) : (
                <div className="growth-count">
                  <AnimatedNumber value={count} />
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
