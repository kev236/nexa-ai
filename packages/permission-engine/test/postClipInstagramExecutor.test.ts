import { describe, expect, it } from 'vitest'
import { createPostClipInstagramExecutor } from '../src/executors/postClipInstagram.js'
import { InMemoryClipStore } from '../src/clips/memoryStore.js'
import { InMemoryOAuthCredentialStore } from '../src/oauthCredentials/memoryStore.js'
import type { InstagramClient } from '../src/adapters/instagramAdapter.js'

function evaluationInput(overrides: Record<string, unknown> = {}) {
  return {
    sourceDescription: 'a clip',
    title: 'A clip',
    viralityScore: 80,
    copyrightRisk: 'low' as const,
    copyrightNotes: 'Original commentary added throughout.',
    recommendation: 'REPOST',
    captions: [{ platform: 'instagram' as const, caption: 'Watch this', hashtags: ['reels'] }],
    reasoning: 'Strong hook.',
    confidence: 0.9,
    ...overrides,
  }
}

function fakeClient(overrides: Partial<InstagramClient> = {}): InstagramClient {
  return {
    exchangeCode: async () => {
      throw new Error('not used by this executor')
    },
    exchangeForLongLivedToken: async () => ({
      accessToken: 'extended_user_token',
      expiresAt: new Date(Date.now() + 5_184_000_000).toISOString(),
    }),
    listConnectedPages: async () => [{ pageId: 'page_1', pageAccessToken: 'refreshed_page_at', instagramBusinessAccountId: 'ig_1' }],
    createMediaContainer: async () => 'container_1',
    getContainerStatus: async () => ({ statusCode: 'FINISHED' }),
    publishContainer: async () => 'media_1',
    ...overrides,
  }
}

const PAYLOAD = { clipId: '', videoUrl: 'https://example.com/clip.mp4', caption: 'Watch this #reels' }

describe('post_clip_instagram executor', () => {
  it('creates a container, waits for it to finish, publishes, and marks the clip posted', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'instagram', {
      accessToken: 'page_at_1',
      refreshToken: 'long_lived_user_token',
      expiresAt: new Date(Date.now() + 5_184_000_000).toISOString(),
      scope: 'instagram_content_publish',
      externalAccountId: 'ig_1',
    })

    let containerArgs: unknown
    const executor = createPostClipInstagramExecutor(
      clipStore,
      oauth,
      fakeClient({
        createMediaContainer: async (pageAccessToken, igUserId, videoUrl, caption) => {
          containerArgs = { pageAccessToken, igUserId, videoUrl, caption }
          return 'container_1'
        },
      }),
      'app_1',
      'secret_1'
    )

    const result = await executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(result).toEqual({ mediaId: 'media_1' })
    expect(containerArgs).toEqual({
      pageAccessToken: 'page_at_1',
      igUserId: 'ig_1',
      videoUrl: 'https://example.com/clip.mp4',
      caption: 'Watch this #reels',
    })
    const record = await clipStore.get(clipId)
    expect(record?.instagramMediaId).toBe('media_1')
    expect(record?.instagramPostedAt).toBeDefined()
  })

  it('re-derives the page token when the stored credential is near expiry', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'instagram', {
      accessToken: 'stale_page_at',
      refreshToken: 'long_lived_user_token',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      scope: 'instagram_content_publish',
      externalAccountId: 'ig_1',
    })

    let usedPageToken: string | undefined
    const executor = createPostClipInstagramExecutor(
      clipStore,
      oauth,
      fakeClient({
        createMediaContainer: async (pageAccessToken) => {
          usedPageToken = pageAccessToken
          return 'container_1'
        },
      }),
      'app_1',
      'secret_1'
    )

    await executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })

    expect(usedPageToken).toBe('refreshed_page_at')
    const credential = await oauth.get('biz_1', 'instagram')
    expect(credential?.accessToken).toBe('refreshed_page_at')
  })

  it('throws a clear error when the container never finishes processing', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'instagram', {
      accessToken: 'page_at_1',
      refreshToken: 'long_lived_user_token',
      expiresAt: new Date(Date.now() + 5_184_000_000).toISOString(),
      scope: 'instagram_content_publish',
      externalAccountId: 'ig_1',
    })
    const executor = createPostClipInstagramExecutor(
      clipStore,
      oauth,
      fakeClient({ getContainerStatus: async () => ({ statusCode: 'IN_PROGRESS' }) }),
      'app_1',
      'secret_1',
      { maxPollMs: 20, pollIntervalMs: 5 }
    )

    await expect(executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(
      /did not finish processing/i
    )
  })

  it('throws when the container reports an error status', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'instagram', {
      accessToken: 'page_at_1',
      refreshToken: 'long_lived_user_token',
      expiresAt: new Date(Date.now() + 5_184_000_000).toISOString(),
      scope: 'instagram_content_publish',
      externalAccountId: 'ig_1',
    })
    const executor = createPostClipInstagramExecutor(
      clipStore,
      oauth,
      fakeClient({ getContainerStatus: async () => ({ statusCode: 'ERROR', statusDetail: 'bad video' }) }),
      'app_1',
      'secret_1'
    )

    await expect(executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(/failed processing/i)
  })

  it('throws when the business has no Instagram credential', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    const executor = createPostClipInstagramExecutor(clipStore, new InMemoryOAuthCredentialStore(), fakeClient(), 'app_1', 'secret_1')

    await expect(executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(
      /no instagram credential/i
    )
  })

  it('refuses to double-post a clip that already has an instagramMediaId', async () => {
    const clipStore = new InMemoryClipStore()
    const clipId = await clipStore.create('biz_1', evaluationInput())
    await clipStore.markPosted(clipId, 'instagram', 'media_existing')
    const oauth = new InMemoryOAuthCredentialStore()
    await oauth.save('biz_1', 'instagram', {
      accessToken: 'page_at_1',
      refreshToken: 'long_lived_user_token',
      expiresAt: new Date(Date.now() + 5_184_000_000).toISOString(),
      scope: 'instagram_content_publish',
      externalAccountId: 'ig_1',
    })
    const executor = createPostClipInstagramExecutor(clipStore, oauth, fakeClient(), 'app_1', 'secret_1')

    await expect(executor({ ...PAYLOAD, clipId }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(/already posted/i)
  })

  it('rejects a malformed payload', async () => {
    const executor = createPostClipInstagramExecutor(
      new InMemoryClipStore(),
      new InMemoryOAuthCredentialStore(),
      fakeClient(),
      'app_1',
      'secret_1'
    )
    await expect(executor({ clipId: 'x' }, { businessId: 'biz_1', agentId: 'agent_1' })).rejects.toThrow(TypeError)
  })
})
