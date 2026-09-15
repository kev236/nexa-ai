-- Step 12: readme.md's "Failure and retries" section — "a crashed or
-- killed run leaves its audit row marked [abandoned]" — was a stated
-- invariant this codebase didn't implement yet (flagged since step 8).
--
-- The gap this closes: recordRequested() writes an audit_log row, then
-- (normally) createPending() writes a matching approvals row a moment
-- later. If the process is killed in that exact window — after the
-- audit row exists, before the approval does — the audit row is stuck
-- at 'requested' forever. There's no approval for a human to see in the
-- dashboard queue, and no code path that would ever revisit that row on
-- its own. engine.ts's reapAbandonedRequests() (added alongside this
-- migration) finds exactly that window — 'requested' rows with no
-- matching approval, older than a safety margin — and marks them
-- 'abandoned' rather than leaving them silently invisible.
ALTER TABLE audit_log DROP CONSTRAINT audit_log_status_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_status_check
  CHECK (status IN ('requested', 'denied', 'executed', 'abandoned'));
ALTER TABLE audit_log ADD COLUMN abandoned_reason text;

-- getByAuditId() (ApprovalStore, step 12) is how reapAbandonedRequests()
-- tells "crashed before the approval was created" apart from "approval
-- exists and is still legitimately pending" — a unique index both makes
-- that lookup fast and documents the real 1:1 relationship createPending()
-- already establishes (exactly one approval per audit_log row, ever).
CREATE UNIQUE INDEX approvals_audit_id_idx ON approvals (audit_id);
