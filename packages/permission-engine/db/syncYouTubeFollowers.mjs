#!/usr/bin/env node
// Step 24 (Growth automation): fetches a business's real YouTube
// subscriber count via the public Data API (no OAuth — subscriber counts
// on a public channel are public data) and writes it the same place the
// dashboard's Growth page form does. Needs the package built first
// (npm run build:permission-engine), DATABASE_URL, and YOUTUBE_API_KEY.
//
// Usage: node db/syncYouTubeFollowers.mjs <business-slug> <youtube-handle>
// Example: node db/syncYouTubeFollowers.mjs trendrush @trendrush-v6h
import pg from 'pg'
import { createYouTubeHttpClient, fetchYouTubeSubscriberCount } from '../dist/index.js'

const [, , businessSlug, handle] = process.argv

if (!businessSlug || !handle?.trim()) {
  console.error('Usage: node db/syncYouTubeFollowers.mjs <business-slug> <youtube-handle>')
  process.exit(1)
}

const apiKey = process.env.YOUTUBE_API_KEY
if (!apiKey) {
  console.error('YOUTUBE_API_KEY is not set.')
  process.exit(1)
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const client = new pg.Client({ connectionString })
await client.connect()

try {
  const business = await client.query('SELECT id FROM businesses WHERE slug = $1', [businessSlug])
  const businessId = business.rows[0]?.id
  if (!businessId) {
    console.error(`No business with slug '${businessSlug}' found — run db:register-business first.`)
    process.exit(1)
  }

  const youtube = createYouTubeHttpClient(apiKey)
  const cleanHandle = handle.trim()
  const stats = await fetchYouTubeSubscriberCount(youtube, cleanHandle)

  const result = await client.query(
    `INSERT INTO social_accounts (business_id, platform, handle, follower_count, created_at, updated_at)
     VALUES ($1, 'youtube', $2, $3, now(), now())
     ON CONFLICT (business_id, platform)
     DO UPDATE SET follower_count = EXCLUDED.follower_count, handle = EXCLUDED.handle, updated_at = now()
     RETURNING platform, handle, follower_count`,
    [businessId, cleanHandle, stats.subscriberCount]
  )
  console.log(`synced real YouTube subscriber count for "${stats.title}":`, result.rows[0])
} finally {
  await client.end()
}
