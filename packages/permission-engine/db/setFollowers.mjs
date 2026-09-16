#!/usr/bin/env node
// Step 20: sets a business's real follower count for one platform —
// the same data the dashboard's Growth page form writes, for updating
// from a script/cron instead of by hand.
//
// Usage: node db/setFollowers.mjs <business-slug> <platform> <count> [handle]
// platform is one of: youtube, instagram, tiktok
// Example: node db/setFollowers.mjs trendrush tiktok 340 trendrush.clips
import pg from 'pg'

const [, , businessSlug, platform, countRaw, handle] = process.argv
const PLATFORMS = ['youtube', 'instagram', 'tiktok']

if (!businessSlug || !platform || !countRaw) {
  console.error('Usage: node db/setFollowers.mjs <business-slug> <platform> <count> [handle]')
  console.error(`platform must be one of: ${PLATFORMS.join(', ')}`)
  process.exit(1)
}
if (!PLATFORMS.includes(platform)) {
  console.error(`platform must be one of: ${PLATFORMS.join(', ')}`)
  process.exit(1)
}
const count = Number(countRaw)
if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
  console.error('count must be a non-negative integer')
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

  const result = await client.query(
    `INSERT INTO social_accounts (business_id, platform, handle, follower_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (business_id, platform)
     DO UPDATE SET follower_count = EXCLUDED.follower_count, handle = COALESCE(EXCLUDED.handle, social_accounts.handle), updated_at = now()
     RETURNING platform, handle, follower_count`,
    [businessId, platform, handle ?? null, count]
  )
  console.log('follower count updated:', result.rows[0])
} finally {
  await client.end()
}
