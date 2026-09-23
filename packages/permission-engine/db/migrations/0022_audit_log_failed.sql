-- Closes a gap the same shape as migration 0011's: resolveApproval()
-- (engine.ts) marks an approval 'approved' and then calls the executor
-- — but until now, if the executor itself threw (a real upload failure,
-- an expired token, a network error), nothing ever recorded that. The
-- audit_log row stayed stuck at 'requested' forever: not 'executed'
-- (the executor never returned), not 'abandoned' (reapAbandonedRequests
-- skips any row that already has an approval, and this one does), and
-- invisible on the Activity page as anything other than a permanently
-- pending-looking request that never resolves. 'failed' is a real,
-- resolved terminal status: the request WAS approved and attempted,
-- and the attempt itself is what didn't succeed — distinct from
-- 'denied' (never even attempted) and 'abandoned' (never resolved by
-- this process at all).
ALTER TABLE audit_log DROP CONSTRAINT audit_log_status_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_status_check
  CHECK (status IN ('requested', 'denied', 'executed', 'abandoned', 'failed'));
ALTER TABLE audit_log ADD COLUMN failed_reason text;
