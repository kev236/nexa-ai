-- Step 7: observability of money, not the ability to move it — this
-- table only ever gets written to by ingestTransactions() reading an
-- adapter's read-only view (NexaLabsAdapter.listTransactions(), backed
-- by Stripe's Charges/Refunds/Payouts APIs). Nothing in this codebase
-- creates a charge, refund, or payout. external_ref + the partial unique
-- index make ingestion idempotent, same convention as events.
CREATE TABLE transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES businesses(id),
  decision_id   uuid REFERENCES decisions(id),
  type          text NOT NULL CHECK (type IN ('charge', 'refund', 'payout')),
  amount_cents  bigint NOT NULL,
  currency      text NOT NULL,
  external_ref  text,
  status        text NOT NULL,
  created_at    timestamptz NOT NULL
);

CREATE INDEX transactions_business_id_idx ON transactions (business_id);
CREATE UNIQUE INDEX transactions_business_external_ref_idx
  ON transactions (business_id, external_ref) WHERE external_ref IS NOT NULL;
