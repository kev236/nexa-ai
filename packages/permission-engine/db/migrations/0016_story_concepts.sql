-- Step 19: Sproutlight — a third business, AI-generated kids' nursery
-- rhymes and short stories. The Story Concept Agent drafts one concept
-- (song lyrics or a short story, broken into scenes for a future
-- visual-generation pass) from an owner-submitted theme; nothing here
-- generates video, audio, or publishes anything yet — see the
-- permission-engine README's step 19 section. Scoped to a real
-- business_id, same as campaigns/content_concepts (step 16).
CREATE TABLE story_concepts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           uuid NOT NULL REFERENCES businesses(id),
  theme                 text NOT NULL,
  format                text NOT NULL CHECK (format IN ('song', 'story')),
  title                 text NOT NULL,
  age_range             text NOT NULL,
  script                text NOT NULL,
  -- One row per scene: sceneNumber, visualDescription,
  -- narrationOrLyricLine, durationSeconds — see src/storyConcepts/store.ts.
  -- One jsonb array, not a child table, same reasoning as
  -- content_concepts.concepts (step 16): scenes are read and written as
  -- one unit, never queried or filtered independently of their concept.
  scenes                jsonb NOT NULL,
  educational_takeaway  text NOT NULL,
  safety_notes          text NOT NULL,
  reasoning             text NOT NULL,
  confidence            double precision,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX story_concepts_business_id_idx ON story_concepts (business_id);
