-- Step 30: a new, small paid-API product — external callers pay (outside
-- this system, manually, until real billing exists) for access to the
-- clip-scoring agent TrendRush already uses internally
-- (agents/clipDiscoveryAgent.ts's evaluateClip). Not tied to any
-- business_id: this is a standalone product, not TrendRush-scoped work,
-- and evaluateClip() itself is a pure function with no store writes —
-- there's nothing business-specific to attach a key to.
--
-- key_hash, not the raw key: same "never store the credential you can
-- verify against a hash of" reasoning as owners.password_hash. SHA-256
-- (not scrypt) is deliberate here — scrypt is for low-entropy human
-- passwords worth slowing down against brute force; an API key is
-- generated with 256 bits of its own randomness, so a fast hash with an
-- indexed equality lookup is the right tradeoff, not a weaker one.
CREATE TABLE api_keys (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  key_hash       text NOT NULL,
  request_count  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz,
  revoked_at     timestamptz
);

CREATE UNIQUE INDEX api_keys_key_hash_idx ON api_keys (key_hash);
