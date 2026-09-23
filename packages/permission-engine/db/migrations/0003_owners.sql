-- Single-tenant today (one owner: Kevin), but its own table rather than an
-- env-var-configured single admin so the approval dashboard's auth model
-- doesn't have to change shape the day a second person needs access.
CREATE TABLE owners (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
