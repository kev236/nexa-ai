-- Step 17: opportunities can now come from an agent (the Opportunity
-- Discovery Agent) as well as the owner typing one in by hand. Nullable
-- and no ON DELETE behavior specified beyond the default (RESTRICT) —
-- an opportunity row outliving the agent that proposed it is fine, but
-- silently losing track of who proposed it, or deleting a scored
-- opportunity as a side effect of deleting an agent, isn't.
ALTER TABLE opportunities ADD COLUMN proposed_by_agent_id uuid REFERENCES agents(id);
