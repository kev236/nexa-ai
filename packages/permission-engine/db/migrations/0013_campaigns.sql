-- Step 16: the front half of the Promote.fun content pipeline — Campaign
-- import + Claude-generated creative concepts. Scoped down from the
-- owner's full "autonomous content engine" doc on purpose: no video
-- rendering, no publishing, no Redis/BullMQ/Docker/S3 — none of that
-- infrastructure is needed for what this migration actually supports,
-- and none of it exists yet. See packages/permission-engine/README.md's
-- step 16 section for the full reasoning.
--
-- business_id everywhere (invariant #4): campaigns belong to whichever
-- business is running them (a new 'promote-fun' business row, registered
-- via db/registerBusiness.mjs — never hardcoded here).
--
-- Deliberately NOT routed through audit_log/approvals: drafting campaign
-- data and creative concepts is not itself money-spending, customer-
-- facing, or irreversible (readme.md invariant #2's trigger for "audit
-- before execute") — same reasoning as step 15's opportunities table.
-- That changes the moment a later phase adds an executor that actually
-- publishes something.
CREATE TABLE campaigns (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES businesses(id),
  -- The source platform's own campaign id, when known (e.g. a Promote.fun
  -- campaign id) — makes CSV/manual re-import idempotent per business.
  -- Null is fine (a purely manual entry with no external id).
  external_id           text,
  product                text NOT NULL,
  target_audience        text,
  problem                text,
  benefits               jsonb NOT NULL DEFAULT '[]'::jsonb,
  unique_selling_points  jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_claims         jsonb NOT NULL DEFAULT '[]'::jsonb,
  forbidden_claims       jsonb NOT NULL DEFAULT '[]'::jsonb,
  cta                    text,
  landing_page           text,
  available_assets       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The raw text/CSV row a human pasted in, kept verbatim — provenance
  -- for what the Campaign Agent normalized above, and what a human
  -- reviewer checks against per "never invent campaign information."
  raw_input              text,
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaigns_business_id_idx ON campaigns (business_id);
CREATE UNIQUE INDEX campaigns_business_external_id_idx
  ON campaigns (business_id, external_id) WHERE external_id IS NOT NULL;

-- One row per Creative Agent run over a campaign. Concepts are stored as
-- one jsonb array rather than a separate table per doc section 5's
-- Hooks/Scripts/ContentIdeas split — see the permission-engine README's
-- step 16 section for why: a concept, its hook, script outline, CTA, and
-- caption are generated and scored together as one coherent unit here,
-- not as five independent lists a reader would have to cross-reference.
CREATE TABLE content_concepts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES campaigns(id),
  business_id   uuid NOT NULL REFERENCES businesses(id),
  agent_id      uuid REFERENCES agents(id),
  -- Array of scored concept objects — see
  -- src/agents/creativeAgent.ts's ContentConcept type for the exact shape.
  concepts      jsonb NOT NULL,
  reasoning     text NOT NULL,
  confidence    real,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_concepts_campaign_id_idx ON content_concepts (campaign_id);
CREATE INDEX content_concepts_business_id_idx ON content_concepts (business_id);
