-- Audit before execute (invariant #2): a row here is written at request
-- time, before an approval exists and before anything runs. Append-only
-- by convention — application code only ever fills in status/actual_result
-- /resolved_at on a row that already exists, never rewrites the original
-- request fields. Mirrors AuditLogRecord in src/audit/store.ts exactly;
-- see that file if this ever drifts.
CREATE TABLE audit_log (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                 uuid NOT NULL REFERENCES businesses(id),
  agent_id                    uuid REFERENCES agents(id),
  action_type                 text NOT NULL,
  payload                     jsonb NOT NULL,
  reasoning                   text NOT NULL,
  expected_result             jsonb NOT NULL,
  expected_cost_amount_cents  bigint,
  expected_cost_currency      text,
  status                      text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'denied', 'executed')),
  actual_result               jsonb,
  denied_reason               text,
  requested_at                timestamptz NOT NULL DEFAULT now(),
  resolved_at                 timestamptz
);

CREATE INDEX audit_log_business_id_idx ON audit_log (business_id);
CREATE INDEX audit_log_status_idx ON audit_log (status);
