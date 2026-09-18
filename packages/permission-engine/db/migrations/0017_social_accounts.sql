-- Step 20: real follower counts per platform per business, entered by
-- hand from the dashboard's new Growth page. The owner's own trigger:
-- Promote.fun requires 200+ followers on YouTube, Instagram, and TikTok
-- before an account can join or run a paid campaign, and TrendRush
-- (clip reposting) doesn't have that yet — Sproutlight tracks the same
-- shape for its own accounts, without the eligibility framing (that
-- threshold is a UI-level constant in the dashboard, not enforced
-- here — this table just stores the numbers).
--
-- Plain owner-authored data, same reasoning as opportunities/campaigns:
-- not money-spending, customer-facing, or irreversible, so it skips
-- audit_log/approvals same as those two tables.
CREATE TABLE social_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id),
  platform        text NOT NULL CHECK (platform IN ('youtube', 'instagram', 'tiktok')),
  handle          text,
  follower_count  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per (business, platform) — updateFollowerCount() upserts on
-- this, never inserts a second row for the same platform.
CREATE UNIQUE INDEX social_accounts_business_platform_idx ON social_accounts (business_id, platform);
