-- Zero rows seeded on purpose (see db/seed.mjs) — agents are config, not
-- code, per invariant #5. `key` is the stable identifier ('waitlist-triage')
-- referenced from config and from ActionRequest.agentId; `role` is a
-- free-text description, not a display name.
CREATE TABLE agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id),
  key             text NOT NULL,
  role            text NOT NULL,
  autonomy_level  integer NOT NULL DEFAULT 1,
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, key)
);

CREATE INDEX agents_business_id_idx ON agents (business_id);
