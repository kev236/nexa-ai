-- business_id lives on every table from this migration onward, per the
-- project's own invariant #4, even though there is exactly one row here
-- for a long time (see docs/plan-001-foundations.md section 3a).
CREATE TABLE businesses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
