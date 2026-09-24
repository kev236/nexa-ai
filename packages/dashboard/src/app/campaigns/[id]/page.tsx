import { notFound } from 'next/navigation'
import { Sparkles } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { Nav } from '@/components/Nav'
import { EmptyState } from '@/components/EmptyState'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { ConfirmButton } from '@/components/ConfirmButton'
import { LaunchTiktokAdForm } from '@/components/LaunchTiktokAdForm'
import { generateConcepts, markConceptRunReviewed, setCampaignStatus } from '@/app/campaigns/actions'
import { CAMPAIGN_BUSINESSES } from '@/app/campaigns/business'
import { getBusiness } from '@/lib/business'
import type { ContentConcept } from '@nexa-ai/permission-engine'

export const dynamic = 'force-dynamic'

function ConceptCard({ concept }: { concept: ContentConcept }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="action-type">{concept.angle.replace('_', ' ')}</span>
        <span className="score-badge">
          <AnimatedNumber value={concept.score.total} />
          /100 {concept.recommended && '★'}
        </span>
      </div>
      <p className="reasoning">&quot;{concept.hook}&quot;</p>
      <p className="meta">{concept.scriptOutline}</p>
      <p className="meta">
        CTA: {concept.cta} · Visual: {concept.visualConcept}
      </p>
      <p className="meta">{concept.caption}</p>
      <p className="meta mono">
        hook {concept.score.hook} · retention {concept.score.retention} · shareability{' '}
        {concept.score.shareability} · clarity {concept.score.clarity} · conversion {concept.score.conversion} ·
        offer fit {concept.score.offerFit}
      </p>
      {concept.hashtags.length > 0 && <p className="meta mono">{concept.hashtags.map((h) => `#${h}`).join(' ')}</p>}
    </div>
  )
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await verifySession()
  const { id } = await params
  const engine = getEngine()
  const campaign = await engine.campaignStore.get(id)
  if (!campaign) notFound()

  const runs = await engine.contentConceptStore.listByCampaign(id)

  // BusinessStore only resolves slug -> record, never the reverse — this
  // finds which of the (small, fixed) CAMPAIGN_BUSINESSES slugs is this
  // campaign's, purely so the "Connect TikTok Ads" link below can pass a
  // human-legible ?business=<slug> the same way every other OAuth start
  // route already does, instead of a raw id.
  const businessSlug = (
    await Promise.all(
      CAMPAIGN_BUSINESSES.map(async (b) => ({ slug: b.slug, business: await getBusiness(b.slug).catch(() => undefined) }))
    )
  ).find((b) => b.business?.id === campaign.businessId)?.slug

  return (
    <>
      <Nav active="campaigns" />
      <div className="page-header">
        <h1>{campaign.product}</h1>
        <p className="subtitle">
          <span className={`status-badge status-${campaign.status === 'active' ? 'active' : 'inactive'}`}>
            {campaign.status}
          </span>
          {campaign.externalId && ` · ${campaign.externalId}`}
        </p>
      </div>

      <section className="deck-enter">
        <h2 className="section-title">Campaign data</h2>
        <div className="card">
          {campaign.targetAudience && (
            <p className="meta">
              <strong>Audience:</strong> {campaign.targetAudience}
            </p>
          )}
          {campaign.problem && (
            <p className="meta">
              <strong>Problem:</strong> {campaign.problem}
            </p>
          )}
          {campaign.benefits.length > 0 && (
            <p className="meta">
              <strong>Benefits:</strong> {campaign.benefits.join(', ')}
            </p>
          )}
          {campaign.uniqueSellingPoints.length > 0 && (
            <p className="meta">
              <strong>USPs:</strong> {campaign.uniqueSellingPoints.join(', ')}
            </p>
          )}
          {campaign.allowedClaims.length > 0 && (
            <p className="meta">
              <strong>Allowed claims:</strong> {campaign.allowedClaims.join(', ')}
            </p>
          )}
          {campaign.forbiddenClaims.length > 0 && (
            <p className="meta">
              <strong>Forbidden claims:</strong> {campaign.forbiddenClaims.join(', ')}
            </p>
          )}
          {campaign.cta && (
            <p className="meta">
              <strong>CTA:</strong> {campaign.cta}
            </p>
          )}
          {campaign.landingPage && (
            <p className="meta">
              <strong>Landing page:</strong> {campaign.landingPage}
            </p>
          )}
          <div className="actions">
            {campaign.status !== 'archived' &&
              (campaign.status === 'active' ? (
                <ConfirmButton
                  action={setCampaignStatus.bind(null, id, 'paused')}
                  confirmMessage={`Pause "${campaign.product}"? Content generation and posting will stop until you reactivate it.`}
                  label="Pause"
                  pendingLabel="Pausing…"
                />
              ) : (
                <form action={setCampaignStatus.bind(null, id, 'active')}>
                  <button type="submit" className="approve">
                    Reactivate
                  </button>
                </form>
              ))}
            <ConfirmButton
              action={setCampaignStatus.bind(null, id, 'archived')}
              confirmMessage={`Archive "${campaign.product}"? There's no way to reactivate it from here afterward.`}
              label="Archive"
              pendingLabel="Archiving…"
            />
          </div>
        </div>
      </section>

      <section className="deck-enter" style={{ animationDelay: '0.1s' }}>
        <h2 className="section-title">Content concepts</h2>
        <div className="opportunities-toolbar">
          <form action={generateConcepts.bind(null, id)}>
            <button type="submit">Generate concepts</button>
          </form>
        </div>

        {runs.length === 0 ? (
          <EmptyState icon={Sparkles} title="No concepts generated yet" />
        ) : (
          runs.map((run) => {
            const sorted = [...run.concepts].sort((a, b) => b.score.total - a.score.total)
            return (
              <div key={run.id} className="concept-run">
                <div className="card-header">
                  <span className="meta">
                    {new Date(run.createdAt).toLocaleString()} · {run.concepts.length} concepts · confidence{' '}
                    {run.confidence}
                  </span>
                  {run.status === 'draft' && (
                    <form action={markConceptRunReviewed.bind(null, run.id, id)}>
                      <button type="submit" className="approve">
                        Mark reviewed
                      </button>
                    </form>
                  )}
                  {run.status === 'reviewed' && <span className="status-badge status-executed">reviewed</span>}
                </div>
                <p className="reasoning">{run.reasoning}</p>
                {sorted.map((concept, i) => (
                  <ConceptCard concept={concept} key={i} />
                ))}
              </div>
            )
          })
        )}
      </section>

      <section className="deck-enter" style={{ animationDelay: '0.15s' }}>
        <h2 className="section-title">Paid promotion</h2>
        <p className="meta">
          Boosts a video already posted on TikTok (Spark Ads). Needs a TikTok Ads account connected first —{' '}
          {businessSlug ? (
            <a href={`/api/oauth/tiktok-ads/start?business=${businessSlug}`}>connect TikTok Ads</a>
          ) : (
            'connect TikTok Ads from the API route directly (business slug not resolved)'
          )}
          . This form never spends anything on its own: it only sends a request to the approval queue, with the
          real daily cost shown, for you to approve or deny.
        </p>
        <div className="card">
          <LaunchTiktokAdForm campaignId={id} />
        </div>
      </section>
    </>
  )
}
