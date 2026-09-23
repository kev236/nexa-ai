-- Step 31: the Clip Scoring API's public landing page (/clip-api) needs
-- a way for a prospective customer to ask for access without a Nexa AI
-- dashboard login — this table is that inbox. fulfilled_at is set the
-- moment the owner generates a real key for them from /api-keys; NULL
-- means "still waiting," the only state the owner's admin view needs to
-- filter on.
CREATE TABLE api_key_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  use_case      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  fulfilled_at  timestamptz
);

CREATE INDEX api_key_requests_fulfilled_at_idx ON api_key_requests (fulfilled_at);
