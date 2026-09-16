import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { getSproutlightBusiness } from '@/lib/business'
import { Nav } from '@/components/Nav'
import { StoryConceptForm } from '@/components/StoryConceptForm'

export const dynamic = 'force-dynamic'

export default async function StoryConceptsPage() {
  await verifySession()

  let businessId: string
  try {
    businessId = (await getSproutlightBusiness()).id
  } catch {
    return (
      <>
        <Nav active="story-concepts" />
        <div className="page-header">
          <h1>Sproutlight</h1>
        </div>
        <p className="empty">
          No &apos;sproutlight&apos; business registered yet — run{' '}
          <code className="mono">npm run db:register-business -- sproutlight &quot;Sproutlight&quot;</code>, then{' '}
          <code className="mono">
            npm run db:register-agent -- sproutlight story-concept-agent &quot;Drafts nursery-rhyme and
            short-story concepts&quot;
          </code>
          .
        </p>
      </>
    )
  }

  const concepts = await getEngine().storyConceptStore.listByBusiness(businessId)

  return (
    <>
      <Nav active="story-concepts" />
      <div className="page-header">
        <h1>Sproutlight</h1>
        <p className="subtitle">
          AI-generated nursery rhymes and short stories for young children. The Story Concept Agent drafts a
          concept — script, scenes, and its own safety notes — for you to review. Nothing here generates video,
          audio, or publishes anything yet.
        </p>
      </div>

      <StoryConceptForm />

      {concepts.length === 0 ? (
        <p className="empty">No concepts generated yet.</p>
      ) : (
        concepts.map((c) => (
          <div className="card" key={c.id}>
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
