-- Step 27: the repost executor migration 0018's own comment said didn't
-- exist yet. A clip only ever gets these set once, by
-- post_clip_youtube's executor immediately after a real upload
-- succeeds — never by hand, never speculatively. NULL means "not
-- posted (yet, or ever)", not "posting failed silently" (a failed
-- upload throws, per readme.md's "fail closed", and never reaches the
-- write that sets these).
ALTER TABLE clips
  ADD COLUMN youtube_video_id text,
  ADD COLUMN youtube_posted_at timestamptz;
