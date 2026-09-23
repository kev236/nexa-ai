-- Step 15: the opportunity-scoring format from the owner's "empire OS"
-- vision doc, scoped down to what was actually asked for — a structured
-- place to record and score a potential new business, not an autonomous
-- discovery/launch pipeline. Purely owner-authored notes: no agent reads
-- or writes this table, and nothing here spends money, contacts a
-- customer, or executes anything, so it doesn't go through
-- requestAction()/approvals like every other write in this system does.
--
-- No business_id, deliberately — same exception as `owners` (see that
-- migration's own comment). An opportunity describes a business that
-- doesn't exist yet, so it isn't scoped to one of the (currently one)
-- existing businesses; it's portfolio-level, same as an owner account.
CREATE TABLE opportunities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  problem          text NOT NULL,
  target_customer  text NOT NULL,
  -- The 12 scored dimensions from the doc, each 0-100, all on a single
  -- "how favorable is this for the opportunity" scale (so a high
  -- Competition score means low competitive pressure, not a high
  -- literal competition level) — see src/opportunities/scoring.ts.
  scores           jsonb NOT NULL,
  -- Server-computed (round of the average of the 12 scores), never
  -- trusted from the form directly — stored so the list can sort/filter
  -- by it without recomputing from scores on every read.
  total_score      integer NOT NULL,
  recommendation   text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX opportunities_status_idx ON opportunities (status);
CREATE INDEX opportunities_total_score_idx ON opportunities (total_score DESC);
