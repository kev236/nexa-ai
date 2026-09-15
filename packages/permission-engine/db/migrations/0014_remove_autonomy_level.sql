-- Step 18: approval policy simplified — auto-approve everything except
-- money (see engine.ts's shouldAutoApprove). autonomy_level was step 11's
-- per-agent opt-in promotion, config.autoApproveMinConfidence its paired
-- threshold; neither is read by anything anymore. Config keys inside the
-- jsonb config column need no migration to stop mattering, but this is a
-- real column, so it gets a real forward-only drop rather than being left
-- behind unused.
ALTER TABLE agents DROP COLUMN autonomy_level;
