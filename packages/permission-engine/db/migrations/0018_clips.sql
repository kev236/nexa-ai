-- Step 23: TrendRush's Clip Discovery Agent — the owner pastes in one
-- clip they're considering reposting (a URL and/or a description), and
-- the agent drafts a scored evaluation: virality, a copyright-risk
-- check (TrendRush reposts other people's footage, a real legal
-- exposure this project's own history already flagged once — see the
-- permission-engine README's step 19 note about why the original
-- clip-reposting business was dropped), per-platform captions, and a
-- recommendation. No repost executor exists — this drafts, a human
-- decides and posts by hand — so (same reasoning as opportunities/
-- campaigns/story_concepts) this skips audit_log/approvals.
CREATE TABLE clips (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         uuid NOT NULL REFERENCES businesses(id),
  source_url          text,
  source_description  text NOT NULL,
  title               text NOT NULL,
  virality_score      integer NOT NULL,
  copyright_risk      text NOT NULL CHECK (copyright_risk IN ('low', 'medium', 'high')),
  copyright_notes     text NOT NULL,
  recommendation      text NOT NULL,
  -- One row per platform: {platform, caption, hashtags} — see
  -- src/clips/store.ts's ClipCaption type. One jsonb array, not a
  -- child table, same reasoning as story_concepts.scenes: always read
  -- and written as one unit with its parent evaluation.
  captions            jsonb NOT NULL,
  reasoning           text NOT NULL,
  confidence          double precision,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clips_business_id_idx ON clips (business_id);
