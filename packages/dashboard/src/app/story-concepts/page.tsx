import { Sparkles } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getSproutlightBusiness } from '@/lib/business'
import { Nav } from '@/components/Nav'
import { StoryConceptForm } from '@/components/StoryConceptForm'
import { EmptyState } from '@/components/EmptyState'
import { PostStoryConceptButton } from '@/components/PostStoryConceptButton'
import { postStoryConceptToYoutubeAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function StoryConceptsPage() {
  await verifySession()

  let business
  try {
    business = await getSproutlightBusiness()
  } catch {
    return (
      <>
        <Nav active="story-concepts" />
        <div className="page-header">
          <h1>Sproutlight</h1>
        </div>
        <EmptyState
          icon={Sparkles}
          title="No 'sproutlight' business registered yet"
          hint={
            <>
              run <code className="mono">npm run db:register-business -- sproutlight &quot;Sproutlight&quot;</code>, then{' '}
              <code className="mono">
                npm run db:register-agent -- sproutlight story-concept-agent &quot;Drafts nursery-rhyme and
                short-story concepts&quot;
              </code>
            </>
          }
        />
      </>
    )
  }

  const engine = getEngine()
  const [concepts, youtubeCredential] = await Promise.all([
    engine.storyConceptStore.listByBusiness(business.id),
    engine.oauthCredentialStore.get(business.id, 'youtube'),
  ])
  const youtubeConnected = youtubeCredential !== undefined

  return (
    <>
      <Nav active="story-concepts" />
      <div className="page-header">
        <h1>Sproutlight</h1>
        <p className="subtitle">
          AI-generated nursery rhymes and short stories for young children. The Story Concept Agent drafts a
          concept — script, scenes, and its own safety notes — for you to review. Attach a real video for any
          concept below and it posts straight to YouTube, no review step — original content, no copyright gate.
        </p>
      </div>

      <div className="deck-enter">
        <StoryConceptForm />
      </div>

      {concepts.length === 0 ? (
        <EmptyState icon={Sparkles} title="No concepts generated yet" />
      ) : (
        concepts.map((c) => (
          <div className="card deck-enter" style={{ animationDelay: '0.1s' }} key={c.id}>
            <div className="card-header">
              <span className="action-type-row">
                <span className="concept-title">{c.title}</span>
                <span className="status-badge status-requested">{c.format}</span>
              </span>
              <span className="meta">{c.ageRange}</span>
            </div>
            <p className="meta">
              Theme: {c.theme} · {new Date(c.createdAt).toLocaleDateString()}
            </p>
            <pre className="payload">{c.script}</pre>
            <p className="reasoning">
              <strong>Educational takeaway:</strong> {c.educationalTakeaway}
            </p>
            <p className="reasoning">
              <strong>Safety notes:</strong> {c.safetyNotes}
            </p>

            {c.youtubeVideoId ? (
              <p className="meta">
                <span className="status-badge status-executed">posted</span>{' '}
                <a href={`https://youtu.be/${c.youtubeVideoId}`} target="_blank" rel="noreferrer" className="mono">
                  youtu.be/{c.youtubeVideoId}
                </a>
              </p>
            ) : youtubeConnected ? (
              <PostStoryConceptButton action={postStoryConceptToYoutubeAction.bind(null, c.id)} />
            ) : (
              <p className="meta">
                <a href={`/api/oauth/youtube/start?business=${business.slug}`} className="status-badge status-requested">
                  Connect YouTube to post this
                </a>
              </p>
            )}

            <details>
              <summary className="meta">
                {c.scenes.length} scene{c.scenes.length === 1 ? '' : 's'} · reasoning
                {c.confidence !== undefined ? ` · confidence ${Math.round(c.confidence * 100)}%` : ''}
              </summary>
              <p className="reasoning">{c.reasoning}</p>
              {c.scenes.map((scene) => (
                <div className="card" key={scene.sceneNumber}>
                  <p className="meta">
                    Scene {scene.sceneNumber} · {scene.durationSeconds}s
                  </p>
                  <p className="reasoning">{scene.visualDescription}</p>
                  <p className="meta mono">&ldquo;{scene.narrationOrLyricLine}&rdquo;</p>
                </div>
              ))}
            </details>
          </div>
        ))
      )}
    </>
  )
}
