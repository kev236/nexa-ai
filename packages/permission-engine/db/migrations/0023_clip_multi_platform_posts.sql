-- Step 29: TrendRush posting to Instagram and TikTok, alongside the
-- existing YouTube path from migration 0020. Same shape, one pair of
-- columns per platform — a clip can post to all three independently,
-- so a single youtube_video_id-style pair can't represent "posted to
-- Instagram but not TikTok". NULL means "not posted (yet, or ever)",
-- same convention as migration 0020's own comment.
ALTER TABLE clips
  ADD COLUMN instagram_media_id text,
  ADD COLUMN instagram_posted_at timestamptz,
  ADD COLUMN tiktok_publish_id text,
  ADD COLUMN tiktok_posted_at timestamptz;

-- Instagram's publish flow needs the connected Instagram Business
-- Account's own id (resolved once, at OAuth-connect time, from the
-- linked Facebook Page — see adapters/instagramAdapter.ts) to know
-- which /{ig-user-id}/media endpoint to call; TikTok's token response
-- also carries an open_id worth keeping for the same "don't rediscover
-- it on every post" reason, even though TikTok's posting endpoints
-- don't require it in the request body. Nullable and unused by
-- YouTube, which needs no such id (the access token alone identifies
-- the channel).
ALTER TABLE oauth_credentials
  ADD COLUMN external_account_id text;
