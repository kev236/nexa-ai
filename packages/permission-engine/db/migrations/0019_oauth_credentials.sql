-- Step 25 (TrendRush publish capability): stores the refresh token from a
-- platform's OAuth consent flow, so a business can act on its own behalf
-- (upload a video) rather than only observe public data via an API key
-- (see social_accounts, which is unrelated — that's follower counts).
--
-- refresh_token is long-lived and grants real write access to the
-- connected account; this table's contents are exactly as sensitive as
-- any other secret in this system. No encryption-at-rest layer exists
-- here yet (matching how every other credential in this codebase is
-- handled — plain env vars, business.config), protected only by normal
-- database access control. Revisit if that stops being good enough.
CREATE TABLE oauth_credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    uuid NOT NULL REFERENCES businesses(id),
  platform       text NOT NULL CHECK (platform IN ('youtube', 'instagram', 'tiktok')),
  access_token   text NOT NULL,
  refresh_token  text NOT NULL,
  expires_at     timestamptz NOT NULL,
  scope          text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One row per (business, platform) — re-authorizing overwrites, same
-- upsert shape as social_accounts_business_platform_idx.
CREATE UNIQUE INDEX oauth_credentials_business_platform_idx ON oauth_credentials (business_id, platform);
