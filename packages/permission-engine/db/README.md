# Migrations

Forward-only, reviewed, numbered SQL files in `migrations/` — this
project's own stated convention. Never edit one that has already run;
add a new numbered file instead. `migrate.mjs` tracks what's applied in
a `schema_migrations` table and only runs what's pending, each migration
in its own transaction.

```
npm run db:migrate            # applies pending migrations, using DATABASE_URL
npm run db:seed               # inserts the one business row ('nexa-labs'), idempotent
npm run db:create-owner       # -- <email> <password>, upserts by email
npm run db:backfill-nexalabs  # step 4: one-time historical load from Sanity into `events`
```

Both read `.env` if present (Node's `--env-file-if-exists`), or fall back
to whatever's already exported — see `.env.example` at the repo root.

## What step 2 deliberately doesn't include

- `tasks`, `transactions` — not in the plan doc's step-2 table set; they
  land when something actually needs to write to them. `events` arrived
  in step 4's migration (0008) once the NexaLabsAdapter needed somewhere
  to write observations.
- `decisions` has a schema (this migration set) but nothing writes to it
  yet — that's step 5, once an agent produces reasoning distinct from a
  raw `ActionRequest`.
- `approvals` doesn't carry `expected_cost` / `risk` / `alternatives` /
  `recommendation` / `confidence` / `consequence_of_inaction` columns from
  the plan doc's fuller sketch — `ActionRequest` doesn't carry those
  fields either yet, and adding nullable columns nothing writes to isn't
  worth doing ahead of the agent that would populate them.

These are deferrals, recorded here so they're not mistaken for oversights.
