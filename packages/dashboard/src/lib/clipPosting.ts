import 'server-only'
import type { ActionOutcome, BusinessRecord, ClipRecord } from '@nexa-ai/permission-engine'
import type { getEngine } from './engine'

const AGENT_KEY = 'clip-discovery-agent'

// YouTube's own limit on snippet.title.
const MAX_TITLE_LENGTH = 100

/**
 * Step 27: posts one already-evaluated clip to TrendRush's connected
 * YouTube channel — real bytes, a real upload, no draft/review step.
 * Called both from evaluateClipAction (a video attached at evaluation
 * time posts immediately, no second click) and from the dashboard's
 * per-clip "Post to YouTube" action (any already-evaluated clip, any
 * time). Same requestAction() call either way — post_clip_youtube has
 * no expectedCost, so it executes the moment this call returns rather
 * than waiting on an owner click, per the owner's own explicit
 * instruction that nothing here should sit as a draft.
 */
export async function postClipToYoutube(
  engine: ReturnType<typeof getEngine>,
  business: BusinessRecord,
  clip: ClipRecord,
  video: { bytes: Buffer; mimeType: string }
): Promise<ActionOutcome> {
  const agent = await engine.agentStore.getByKey(business.id, AGENT_KEY)
  if (!agent) {
    throw new Error(`no agent '${AGENT_KEY}' registered for '${business.slug}' — run db:register-agent first`)
  }

  const youtubeCaption = clip.captions.find((c) => c.platform === 'youtube')
  const description = youtubeCaption
    ? `${youtubeCaption.caption}\n\n${youtubeCaption.hashtags.map((h) => `#${h}`).join(' ')}`
    : clip.sourceDescription

  return engine.requestAction({
    businessId: business.id,
    agentId: agent.id,
    actionType: 'post_clip_youtube',
    payload: {
      clipId: clip.id,
      title: clip.title.slice(0, MAX_TITLE_LENGTH),
      description,
      tags: youtubeCaption?.hashtags ?? [],
      videoBase64: video.bytes.toString('base64'),
      mimeType: video.mimeType,
      privacyStatus: 'public',
    },
    reasoning:
      'Posting the clip the owner attached video for — full autonomy, no manual review step, per the owner\'s standing instruction.',
    expectedResult: { clipId: clip.id, title: clip.title },
    confidence: clip.confidence,
  })
}
