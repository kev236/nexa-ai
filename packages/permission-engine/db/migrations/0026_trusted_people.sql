-- The owner's "recognize known people, reject strangers" ask (Q2),
-- answered without collecting anyone's biometrics: a trusted person is
-- recognized by something they hold (a PIN they set themselves, same
-- reasoning as a device passkey), not their voice or face. Enrolling a
-- real person's voiceprint or face without their own informed consent
-- is GDPR "special category" data in the Netherlands/EU — this table
-- sidesteps that risk entirely rather than building toward it. The
-- owner explicitly adds each person (see src/trustedPeople/store.ts);
-- there is no self-service enrollment.
--
-- pin_hash, never the raw PIN — same scrypt hashing as owners.password_hash
-- (see src/password.ts), reused rather than inventing a second scheme.
--
-- failed_attempts/locked_until: this table is checked from a route with
-- no owner login at all (src/app/talk in the dashboard) — unlike the
-- owner's own password check, a real brute-force lockout is needed
-- here, not just a slow hash. Tracked in the database rather than in
-- server memory: this app runs as Vercel serverless functions, which
-- don't share memory across invocations (or even guarantee the same
-- instance handles two requests in a row) — an in-memory counter would
-- silently do nothing in production.
CREATE TABLE trusted_people (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  pin_hash          text NOT NULL,
  added_by_owner_id uuid NOT NULL REFERENCES owners (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_used_at      timestamptz,
  revoked_at        timestamptz,
  failed_attempts   integer NOT NULL DEFAULT 0,
  locked_until      timestamptz
);

CREATE INDEX trusted_people_added_by_owner_id_idx ON trusted_people (added_by_owner_id);
