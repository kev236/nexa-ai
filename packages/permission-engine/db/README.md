# Migrations

Forward-only, reviewed, numbered SQL files in `migrations/` — this
project's own stated convention. Never edit one that has already run;
add a new numbered file instead. `migrate.mjs` tracks what's applied in
a `schema_migrations` table and only runs what's pending, each migration
in its own transaction.

```
npm run db:migrate             # applies pending migrations, using DATABASE_URL
npm run db:seed                # inserts the one business row ('nexa-labs'), idempotent
npm run db:create-owner        # -- <email> <password>, upserts by email
npm run db:backfill-nexalabs   # step 4: one-time historical load from Sanity into `events`
npm run db:register-agent      # -- <business-slug> <key> <role>, upserts by (business, key)
npm run db:set-business-config # -- <business-slug> <json-config>, shallow-merges into businesses.config
npm run db:run-waitlist-triage # step 5/6: drafts + sends replies for un-triaged events, needs
                                # ANTHROPIC_API_KEY, RESEND_API_KEY, and config.emailFrom set
```

Both read `.env` if present (Node's `--env-file-if-exists`), or fall back
to whatever's already exported — see `.env.example` at the repo root.

## What step 2 deliberately doesn't include

- `tasks`, `transactions` — not in the plan doc's step-2 table set; they
  land when something actually needs to write to them. `events` arrived
  in step 4's migration (0008) once the NexaLabsAdapter needed somewhere
  to write observations.
- `decisions` got its first real writes in step 5 (`0009` added
  `event_id`, linking a decision to the event it's about and letting the
  triage agent skip events it's already handled). It still doesn't carry
  `expected_result`/`confidence` beyond what the LLM tool call returns —
  no richer scoring yet.
- Step 6 (`send_email`, `src/executors/sendEmail.ts`) needed no new
  migration — `businesses.config jsonb` already existed from step 2, and
  `config.emailFrom` is just a key read out of it. `db/setBusinessConfig.mjs`
  is the one generic way to write any key into it, not just this one.
- `approvals` doesn't carry `expected_cost` / `risk` / `alternatives` /
  `recommendation` / `confidence` / `consequence_of_inaction` columns from
  the plan doc's fuller sketch — `ActionRequest` doesn't carry those
  fields either yet, and adding nullable columns nothing writes to isn't
  worth doing ahead of the agent that would populate them.

These are deferrals, recorded here so they're not mistaken for oversights.
