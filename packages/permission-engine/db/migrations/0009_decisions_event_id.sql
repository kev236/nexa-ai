-- Links a decision to the event it's about, and lets step 5's agent check
-- "has this event already been triaged" idempotently before calling the
-- LLM again. Nullable: not every future decision originates from an event.
ALTER TABLE decisions ADD COLUMN event_id uuid REFERENCES events(id);
CREATE INDEX decisions_event_id_idx ON decisions (event_id);
