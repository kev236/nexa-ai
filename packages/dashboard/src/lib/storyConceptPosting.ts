import 'server-only'
import type { ActionOutcome, BusinessRecord, StoryConceptRecord } from '@nexa-ai/permission-engine'
import type { getEngine } from './engine'

const AGENT_KEY = 'story-concept-agent'

// YouTube's own limit on snippet.title.
const MAX_TITLE_LENGTH = 100

/**
 * Sproutlight's equivalent of lib/clipPosting.ts — posts one story
 * concept's video to Sproutlight's connected YouTube channel. Unlike
 * clipPosting.ts, there's no copyright-risk gate to check: a story
 * concept is 100% original AI-generated content, not a repost of
 * someone else's footage, so every concept is equally safe to auto-post
 * the moment a video exists for it.
 */
export async function postStoryConceptToYoutube(
  engine: ReturnType<typeof getEngine>,
  business: BusinessRecord,
  concept: StoryConceptRecord,
  video: { bytes: Buffer; mimeType: string }
): Promise<ActionOutcome> {
  const agent = await engine.agentStore.getByKey(business.id, AGENT_KEY)
  if (!agent) {
    throw new Error(`no agent '${AGENT_KEY}' registered for '${business.slug}' — run db:register-agent first`)
  }

  const description = `${concept.educationalTakeaway}\n\n${concept.script}`.slice(0, 5000)

  return engine.requestAction({
    businessId: business.id,
    agentId: agent.id,
    actionType: 'post_story_concept_youtube',
    payload: {
      conceptId: concept.id,
      title: concept.title.slice(0, MAX_TITLE_LENGTH),
      description,
      tags: [concept.theme, concept.format, concept.ageRange].filter(Boolean),
      videoBase64: video.bytes.toString('base64'),
      mimeType: video.mimeType,
      privacyStatus: 'public',
    },
    reasoning:
      'Posting the story concept the owner attached video for — original content, full autonomy, no manual review step.',
    expectedResult: { conceptId: concept.id, title: concept.title },
    confidence: concept.confidence,
  })
}
