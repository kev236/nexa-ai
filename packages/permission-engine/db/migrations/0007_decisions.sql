-- Schema only — nothing in application code writes to this table yet.
-- Per the plan doc's build order, migrations for the full step-2 table
-- set land together; `decisions` starts getting populated once an agent
-- exists that produces something distinct from a raw ActionRequest (step
-- 5), separate from the approval it triggers. `task_id` has no foreign
-- key yet because there is no `tasks` table — that's also out of step
-- 2's scope — it's a plain uuid until tasks exists.
CREATE TABLE decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id),
  agent_id         uuid REFERENCES agents(id),
  task_id          uuid,
  action_type      text NOT NULL,
  reasoning        text NOT NULL,
  expected_result  jsonb NOT NULL,
  actual_result    jsonb,
  confidence       numeric,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);

CREATE INDEX decisions_business_id_idx ON decisions (business_id);
