-- Raw observations from adapters (step 4). external_id + the partial
-- unique index make ingestion idempotent: backfill and poll can both run
-- repeatedly over overlapping ranges without duplicating rows.
CREATE TABLE events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid NOT NULL REFERENCES businesses(id),
  source          text NOT NULL,
  type            text NOT NULL,
  payload         jsonb NOT NULL,
  occurred_at     timestamptz NOT NULL,
  ingested_at     timestamptz NOT NULL DEFAULT now(),
  ingestion_mode  text NOT NULL CHECK (ingestion_mode IN ('backfill', 'poll', 'webhook')),
  external_id     text
);

CREATE INDEX events_business_id_idx ON events (business_id);
-- Scoped to business_id, not just source: external_id is only guaranteed
-- unique within one business's instance of a source system (its own
-- Sanity project, its own Stripe account, ...), not across businesses.
CREATE UNIQUE INDEX events_business_source_external_id_idx
  ON events (business_id, source, external_id) WHERE external_id IS NOT NULL;
