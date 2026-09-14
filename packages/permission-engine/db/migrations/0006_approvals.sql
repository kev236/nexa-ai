-- Mirrors ApprovalRecord in src/approvals/store.ts. `request` stores the
-- full ActionRequest as it stood when requestAction created this row.
--
-- This is deliberately narrower than the richer approvals shape sketched
-- in docs/plan-001-foundations.md section 3a (expected_cost, risk,
-- alternatives, recommendation, confidence, consequence_of_inaction) —
-- those columns require an agent that actually produces that reasoning,
-- which doesn't exist yet (only the 'noop' executor does). Adding nullable
-- columns nothing writes to yet would be exactly the kind of half-built
-- feature this project's own conventions warn against. They arrive with
-- the decisions table's real use, in a later migration, not this one.
CREATE TABLE approvals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id     uuid NOT NULL REFERENCES audit_log(id),
  business_id  uuid NOT NULL REFERENCES businesses(id),
  request      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  resolved_by  uuid REFERENCES owners(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

CREATE INDEX approvals_business_id_idx ON approvals (business_id);
CREATE INDEX approvals_status_idx ON approvals (status);
