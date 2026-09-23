import { describe, expect, it } from 'vitest'
import { createPostStoryConceptYoutubeExecutor } from '../src/executors/postStoryConceptYoutube.js'
import { InMemoryStoryConceptStore } from '../src/storyConcepts/memoryStore.js'
import { InMemoryOAuthCredentialStore } from '../src/oauthCredentials/memoryStore.js'
import type { YouTubeUploadClient } from '../src/adapters/youtubeUploadAdapter.js'

function conceptInput(overrides: Record<string, unknown> = {}) {
  return {
    theme: 'sharing',
    format: 'song' as const,
    title: 'The Sharing Song',
    ageRange: '2-4',
    script: 'Verse one...',
    scenes: [{ sceneNumber: 1, visualDescription: 'Two puppies share a ball', narrationOrLyricLine: 'Share and care', durationSeconds: 5 }],
    educationalTakeaway: 'Sharing is caring.',
    safetyNotes: 'No scary imagery.',
    reasoning: 'Simple, repeatable hook for the target age range.',
    confidence: 0.9,
    ...overrides,
  }
}

function fakeUploadClient(overrides: Partial<YouTubeUploadClient> = {}): YouTubeUploadClient {
  return {
    refreshAccessToken: async () => ({ accessToken: 'refreshed_at', expiresAt: new Date(Date.now() + 3600_000).toISOString() }),
    uploadVideo: async () => ({ videoId: 'vid_1' }),
    ...overrides,
  }
}

const PAYLOAD = {
  conceptId: '',
  title: 'The Sharing Song',
  description: 'desc',
  tags: ['sharing', 'song'],
  videoBase64: Buffer.from('fake bytes').toString('base64'),
  mimeType: 'video/mp4',
  privacyStatus: 'public' as const,
}

describe('post_story_concept_youtube executor', () => {
  it('uploads the video and marks the concept posted', async () => {
    const storyConceptStore = new InMemoryStoryConceptStore()
    const conceptId = await storyConceptStore.create('biz_1', conceptInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'youtube', {
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'youtube.upload',
    })

    let uploadedWith: unknown
    const executor = createPostStoryConceptYoutubeExecutor(
      storyConceptStore,
      oauth,
      fakeUploadClient({
        uploadVideo: async (accessToken, metadata, video, mimeType) => {
          uploadedWith = { accessToken, metadata, videoLength: video.length, mimeType }
          return { videoId: 'vid_1' }
        },
      }),
      'client_id',
      'client_secret'
    )

    const result = await executor({ ...PAYLOAD, conceptId }, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(result).toEqual({ videoId: 'vid_1', url: 'https://youtu.be/vid_1' })
    expect(uploadedWith).toMatchObject({ accessToken: 'at_1', mimeType: 'video/mp4' })
    expect((uploadedWith as { metadata: { madeForKids: boolean } }).metadata.madeForKids).toBe(true)
    const record = await storyConceptStore.get(conceptId)
    expect(record?.youtubeVideoId).toBe('vid_1')
    expect(record?.youtubePostedAt).toBeDefined()
  })

  it('refreshes an expired access token before uploading, and persists the new one', async () => {
    const storyConceptStore = new InMemoryStoryConceptStore()
    const conceptId = await storyConceptStore.create('biz_1', conceptInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'youtube', {
      accessToken: 'stale_at',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
      scope: 'youtube.upload',
    })

    let usedAccessToken: string | undefined
    const executor = createPostStoryConceptYoutubeExecutor(
      storyConceptStore,
      oauth,
      fakeUploadClient({
        uploadVideo: async (accessToken) => {
          usedAccessToken = accessToken
          return { videoId: 'vid_2' }
        },
      }),
      'client_id',
      'client_secret'
    )

    await executor({ ...PAYLOAD, conceptId }, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(usedAccessToken).toBe('refreshed_at')
    const credential = await oauth.get('biz_1', 'youtube')
    expect(credential?.accessToken).toBe('refreshed_at')
  })

  it('throws when the business has no YouTube credential', async () => {
    const storyConceptStore = new InMemoryStoryConceptStore()
    const conceptId = await storyConceptStore.create('biz_1', conceptInput())
    const executor = createPostStoryConceptYoutubeExecutor(
      storyConceptStore,
      new InMemoryOAuthCredentialStore(),
      fakeUploadClient(),
      'client_id',
      'client_secret'
    )

    await expect(executor({ ...PAYLOAD, conceptId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(
      /no youtube credential/i
    )
  })

  it('refuses to double-post a concept that already has a youtubeVideoId', async () => {
    const storyConceptStore = new InMemoryStoryConceptStore()
    const conceptId = await storyConceptStore.create('biz_1', conceptInput())
    await storyConceptStore.markPosted(conceptId, 'vid_existing')
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'youtube', {
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'youtube.upload',
    })
    const executor = createPostStoryConceptYoutubeExecutor(storyConceptStore, oauth, fakeUploadClient(), 'client_id', 'client_secret')

    await expect(executor({ ...PAYLOAD, conceptId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(
      /already posted/i
    )
  })

  it('rejects a malformed payload', async () => {
    const executor = createPostStoryConceptYoutubeExecutor(
      new InMemoryStoryConceptStore(),
      new InMemoryOAuthCredentialStore(),
      fakeUploadClient(),
      'client_id',
      'client_secret'
    )
    await expect(executor({ conceptId: 'x' }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })
})
