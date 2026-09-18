import { describe, expect, it } from 'vitest'
import { createPostClipYoutubeExecutor } from '../src/executors/postClipYoutube.js'
import { InMemoryClipStore } from '../src/clips/memoryStore.js'
import { InMemoryOAuthCredentialStore } from '../src/oauthCredentials/memoryStore.js'
import type { YouTubeUploadClient } from '../src/adapters/youtubeUploadAdapter.js'

function evaluationInput(overrides: Record<string, unknown> = {}) {
  return {
    sourceDescription: 'a clip',
    title: 'A clip',
    viralityScore: 80,
    copyrightRisk: 'low' as const,
    copyrightNotes: 'Original commentary added throughout.',
    recommendation: 'REPOST',
    captions: [{ platform: 'youtube' as const, caption: 'Watch this', hashtags: ['fyp'] }],
    reasoning: 'Strong hook.',
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
  clipId: '',
  title: 'A clip',
  description: 'desc',
  tags: ['fyp'],
  videoBase64: Buffer.from('fake bytes').toString('base64'),
  mimeType: 'video/mp4',
  privacyStatus: 'public' as const,
}

describe('post_clip_youtube executor', () => {
  it('uploads the video and marks the clip posted', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'youtube', {
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'youtube.upload',
    })

    let uploadedWith: unknown
    const executor = createPostClipYoutubeExecutor(
      clipStore,
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

    const result = await executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(result).toEqual({ videoId: 'vid_1', url: 'https://youtu.be/vid_1' })
    expect(uploadedWith).toMatchObject({ accessToken: 'at_1', mimeType: 'video/mp4' })
    const record = await clipStore.get(clipId)
    expect(record?.youtubeVideoId).toBe('vid_1')
    expect(record?.youtubePostedAt).toBeDefined()
  })

  it('refreshes an expired access token before uploading, and persists the new one', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'youtube', {
      accessToken: 'stale_at',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
      scope: 'youtube.upload',
    })

    let usedAccessToken: string | undefined
    const executor = createPostClipYoutubeExecutor(
      clipStore,
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

    await executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(usedAccessToken).toBe('refreshed_at')
    const credential = await oauth.get('biz_1', 'youtube')
    expect(credential?.accessToken).toBe('refreshed_at')
  })

  it('throws when the business has no YouTube credential', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const executor = createPostClipYoutubeExecutor(
      clipStore,
      new InMemoryOAuthCredentialStore(),
      fakeUploadClient(),
      'client_id',
      'client_secret'
    )

    await expect(executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(
      /no youtube credential/i
    )
  })

  it('refuses to double-post a clip that already has a youtubeVideoId', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    await clipStore.markPosted(clipId, 'vid_existing')
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'youtube', {
      accessToken: 'at_1',
      refreshToken: 'rt_1',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      scope: 'youtube.upload',
    })
    const executor = createPostClipYoutubeExecutor(clipStore, oauth, fakeUploadClient(), 'client_id', 'client_secret')

    await expect(executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(
      /already posted/i
    )
  })

  it('rejects a malformed payload', async () => {
    const executor = createPostClipYoutubeExecutor(
      new InMemoryClipStore(),
      new InMemoryOAuthCredentialStore(),
      fakeUploadClient(),
      'client_id',
      'client_secret'
    )
    await expect(executor({ clipId: 'x' }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })
})
