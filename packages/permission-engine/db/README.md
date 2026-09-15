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
npm run db:backfill-nexalabs   # step 4/7: one-time historical load from Sanity into `events`,
                                # plus (if STRIPE_SECRET_KEY and/or ETHERSCAN_API_KEY +
                                # WALLET_ADDRESS are set) Stripe/crypto into `transactions`
npm run db:register-agent      # -- <business-slug> <key> <role>, upserts by (business, key)
npm run db:set-business-config # -- <business-slug> <json-config>, shallow-merges into businesses.config
npm run db:run-waitlist-triage # step 5/6: drafts + sends replies for un-triaged events, needs
                                # ANTHROPIC_API_KEY, RESEND_API_KEY, and config.emailFrom set
npm run db:set-agent-autonomy  # -- <business-slug> <agent-key> <level> [min-confidence], step 11:
                                # promotes one agent to auto-execute above a confidence threshold;
                                # a level >= 2 without a threshold is refused, not defaulted
```

Both read `.env` if present (Node's `--env-file-if-exists`), or fall back
to whatever's already exported — see `.env.example` at the repo root.

## What step 2 deliberately doesn't include

- `tasks`, `transactions` — not in the plan doc's step-2 table set; they
  land when something actually needs to write to them. `events` arrived
  in step 4's migration (0008) once the NexaLabsAdapter needed somewhere
  to write observations. `transactions` arrived in step 7's migration
  (`0010`) — read-only, populated only by `engine.ingestTransactions()`
  reading `NexaLabsAdapter.listTransactions()` (Stripe charges/refunds/
  payouts, and/or a watched wallet's USDC transfers on Ethereum mainnet
  — a KVK-free alternative money-observability source, added the same
  step; see the permission-engine readme). `decision_id` is nullable and
  nothing sets it yet — no agent
  reasons about a transaction and produces a decision that references one
  yet, so the column exists ahead of that, same as the plan doc's schema
  sketch, not ahead of a real writer.
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
  `recommendation` / `consequence_of_inaction` columns from the plan
  doc's fuller sketch — `ActionRequest` doesn't carry those fields
  either yet, and adding nullable columns nothing writes to isn't worth
  doing ahead of the agent that would populate them. `confidence` is the
  exception (step 11): it lives inside `approvals.request`'s existing
  jsonb blob, not a new column — the whole `ActionRequest` is already
  stored there, so no migration was needed for a field engine.ts reads
  back out of it.

These are deferrals, recorded here so they're not mistaken for oversights.
