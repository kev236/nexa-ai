import { Film } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getTrendRushBusiness } from '@/lib/business'
import { Nav } from '@/components/Nav'
import { ClipForm } from '@/components/ClipForm'
import { EmptyState } from '@/components/EmptyState'
import type { ClipRecord } from '@nexa-ai/permission-engine'

export const dynamic = 'force-dynamic'

const RISK_BADGE: Record<ClipRecord['copyrightRisk'], string> = {
  low: 'status-badge status-active',
  medium: 'status-badge status-abandoned',
  high: 'status-badge status-denied',
}

const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

export default async function ClipsPage() {
  await verifySession()

  let businessId: string
  try {
    businessId = (await getTrendRushBusiness()).id
  } catch {
    return (
      <>
        <Nav active="clips" />
        <div className="page-header">
          <h1>Clips</h1>
        </div>
        <EmptyState
          icon={Film}
          title="No 'trendrush' business registered yet"
          hint={
            <>
              run <code className="mono">npm run db:register-business -- trendrush &quot;TrendRush&quot;</code>, then{' '}
              <code className="mono">
                npm run db:register-agent -- trendrush clip-discovery-agent &quot;Evaluates clips TrendRush is
                considering reposting&quot;
              </code>
            </>
          }
        />
      </>
    )
  }

  const clips = await getEngine().clipStore.listByBusiness(businessId)

  return (
    <>
      <Nav active="clips" />
      <div className="page-header">
        <h1>Clips</h1>
        <p className="subtitle">
          TrendRush&apos;s Clip Discovery Agent scores a clip you&apos;re considering reposting — virality,
          copyright risk, and a draft caption for each platform — before you spend time producing or posting
          anything. Nothing here reposts, schedules, or publishes.
        </p>
      </div>

      <div className="deck-enter">
        <ClipForm />
      </div>

      {clips.length === 0 ? (
        <EmptyState icon={Film} title="No clips evaluated yet" />
      ) : (
        clips.map((clip) => (
          <div className="card deck-enter" style={{ animationDelay: '0.1s' }} key={clip.id}>
            <div className="card-header">
              <span className="action-type-row">
                <span className="concept-title">{clip.title}</span>
                <span className={RISK_BADGE[clip.copyrightRisk]}>{clip.copyrightRisk} risk</span>
              </span>
              <span className="meta">
                {clip.viralityScore}/100 virality · {new Date(clip.createdAt).toLocaleDateString()}
              </span>
            </div>

            {clip.sourceUrl && (
              <p className="meta">
                <a href={clip.sourceUrl} target="_blank" rel="noreferrer" className="mono">
                  {clip.sourceUrl}
                </a>
              </p>
            )}
            <p className="reasoning">{clip.sourceDescription}</p>

            <p className="reasoning">
              <strong>Recommendation: {clip.recommendation}</strong>
            </p>
            <p className="reasoning">
              <strong>Copyright notes:</strong> {clip.copyrightNotes}
            </p>

            <details>
              <summary className="meta">
                {clip.captions.length} platform caption{clip.captions.length === 1 ? '' : 's'} · reasoning
                {clip.confidence !== undefined ? ` · confidence ${Math.round(clip.confidence * 100)}%` : ''}
              </summary>
              <p className="reasoning">{clip.reasoning}</p>
              {clip.captions.map((caption) => (
                <div className="card" key={caption.platform}>
                  <p className="meta">{PLATFORM_LABELS[caption.platform] ?? caption.platform}</p>
                  <p className="reasoning">{caption.caption}</p>
                  <p className="meta mono">{caption.hashtags.map((tag) => `#${tag}`).join(' ')}</p>
                </div>
              ))}
            </details>
          </div>
        ))
      )}
    </>
  )
}
