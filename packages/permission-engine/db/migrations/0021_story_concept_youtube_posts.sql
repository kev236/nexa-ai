-- Sproutlight's YouTube posting columns — same shape as migration 0020's
-- clips.youtube_video_id/youtube_posted_at, and the same invariant: a
-- story concept only ever gets these set once, by post_story_concept_youtube's
-- executor immediately after a real upload succeeds. NULL means "not
-- posted (yet, or ever)", never "posting failed silently" — a failed
-- upload throws and never reaches the write that sets these.
ALTER TABLE story_concepts
  ADD COLUMN youtube_video_id text,
  ADD COLUMN youtube_posted_at timestamptz;
