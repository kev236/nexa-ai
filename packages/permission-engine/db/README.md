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
                                # ANTHROPIC_API_KEY, RESEND_API_KEY, and config.emailFrom set — since
                                # step 18, sends the moment it's drafted, no approval step
npm run db:run-transaction-review # step 14: reviews un-reviewed transactions, drafts an owner
                                   # alert for anything worth flagging; needs ANTHROPIC_API_KEY,
                                   # RESEND_API_KEY, and an owner account (db:create-owner) to
                                   # send to — register the agent first (see below)
npm run db:register-business   # -- <slug> <name>, step 16: the generic way to add a second
                                # (third, ...) business row, upserts by slug
npm run db:import-campaign     # -- <business-slug> <path-to-file>, step 16: normalizes one raw
                                # campaign (.txt) or one-campaign-per-line (.csv) via the Campaign
                                # Agent; needs ANTHROPIC_API_KEY
npm run db:generate-concepts   # -- <business-slug> <campaign-id> [agent-key], step 16: generates
                                # 6 scored content concepts for one campaign via the Creative
                                # Agent; needs ANTHROPIC_API_KEY
npm run db:discover-opportunities # -- <business-slug> [agent-key], step 17: proposes up to 3 new
                                   # scored opportunities via the Opportunity Discovery Agent;
                                   # needs ANTHROPIC_API_KEY — unlike generate-concepts, the agent
                                   # must already be registered (see below), not optional
npm run db:generate-story-concept # -- <business-slug> <song|story> <theme>, step 19: generates one
                                   # nursery-rhyme/short-story concept for Sproutlight; needs
                                   # ANTHROPIC_API_KEY
npm run db:set-followers       # -- <business-slug> <youtube|instagram|tiktok> <count> [handle],
                                # step 20: upserts a real follower count; same write the dashboard's
                                # Growth page form makes
```

Registering the transaction-review agent (step 14, optional — only
useful once Stripe or the crypto wallet is configured):

```
npm run db:register-agent -- nexa-labs transaction-review "Reviews new transactions and flags anything the owner should look at"
```

Registering the opportunity-discovery agent (step 17 — required before
`db:discover-opportunities` or the dashboard's "Discover opportunities"
button will do anything other than return a clear error):

```
npm run db:register-agent -- nexa-labs opportunity-discovery "Proposes new scored business/product opportunities for owner review"
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
  step; see the permission-engine readme). `decision_id` sat nullable
  and unwritten until step 14's transaction-review agent gave it a real
  writer (`TransactionStore.linkDecision()`) — the column existed ahead
  of that agent, same as the plan doc's schema sketch, not ahead of a
  real writer for long.
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

## Migration 0011 (step 12)

Adds `'abandoned'` to `audit_log.status`'s CHECK constraint and an
`abandoned_reason` column (mirrors `denied_reason`) — see the
permission-engine README's step 12 section for what marks a row
abandoned and why. Also adds `approvals_audit_id_idx`, a unique index on
`approvals.audit_id`: `createPending()` has always written exactly one
approval per audit row, this just documents and enforces that real 1:1
relationship, and is what makes `ApprovalStore.getByAuditId()` a fast
lookup rather than a table scan.

Step 13's spending limits needed no migration — `businesses.config` is
already a jsonb column, so `spendingLimitCents` /
`spendingLimitCurrency` / `spendingLimitWindowHours` were just three
more keys in it, set the same way `emailFrom` is. **Removed by step 18**
(see migration 0014 and the permission-engine README): money now always
requires an owner decision regardless of amount, so these config keys —
if still set on a business from before — are inert, not read by
anything.

## Migration 0012 (step 15)

Adds `opportunities` — the manual opportunity-scoring tool, entered and
managed entirely through the dashboard's own `/opportunities` pages, not
a CLI script (there's no agent or trusted-operator workflow for it the
way `db:create-owner`/`db:register-agent` exist for admin actions — it's
plain owner-authored data behind the dashboard's session login). No
`business_id` column, deliberately — see the permission-engine README's
step 15 section.

## Migration 0013 (step 16)

Adds `campaigns` (imported/normalized Promote.fun campaign data) and
`content_concepts` (one row per Creative Agent run over a campaign,
holding the whole scored batch as one jsonb array — see the
permission-engine README's step 16 section for why that's one array
rather than five separate tables). Both are scoped to a real
`business_id` — set up a second business first:

```
npm run db:register-business -- promote-fun "Promote.fun"
npm run db:register-agent -- promote-fun creative-agent "Generates and scores content concepts for imported campaigns"
npm run db:import-campaign -- promote-fun path/to/brief.txt
npm run db:generate-concepts -- promote-fun <campaign-id>
```

Campaigns can also be imported directly from the dashboard
(`/campaigns/new`) — both paths call the same `importCampaignOnce()`.

## Migration 0014 (step 18)

Drops `agents.autonomy_level`. Step 18 replaced step 11's per-agent,
confidence-threshold-gated auto-approval with a single default policy
(auto-approve everything except money) — the column and
`config.autoApproveMinConfidence` it worked alongside no longer mean
anything to `engine.ts`'s `shouldAutoApprove()`, so rather than leave a
column nothing reads, this migration removes it. `db/setAgentAutonomy.mjs`
was deleted alongside it — there's no longer a level to set.

## Migration 0015 (step 17)

Adds `opportunities.proposed_by_agent_id` (nullable, `REFERENCES
agents(id)`) — set when the Opportunity Discovery Agent proposed a row
(via the new `propose_opportunity` executor,
`src/executors/proposeOpportunity.ts`) rather than the owner typing one
in directly. See the permission-engine README's step 17 section for why
a proposal goes through `requestAction()` at all despite spending no
money and needing no approval.

## Migration 0016 (step 19)

Adds `story_concepts` — Sproutlight's generated nursery-rhyme/short-story
concepts (title, age range, full script, a scene breakdown, an
educational takeaway, and the model's own safety notes), scoped to a
real `business_id` same as campaigns/content_concepts. Set up the
business and agent first:

```
npm run db:register-business -- sproutlight "Sproutlight"
npm run db:register-agent -- sproutlight story-concept-agent "Drafts nursery-rhyme and short-story concepts"
npm run db:generate-story-concept -- sproutlight song "sharing with a friend"
```

Concepts can also be generated directly from the dashboard's
"Sproutlight" tab (`/story-concepts`) — both paths call the same
`generateStoryConceptOnce()`.

## Migration 0017 (step 20)

Adds `social_accounts` — real follower counts per platform
(`youtube`/`instagram`/`tiktok`), one row per `(business_id, platform)`
(upserted, never duplicated). Plain owner-entered data, same reasoning
as opportunities/campaigns: it skips `audit_log`/approvals. Prompted by
a real constraint: Promote.fun requires 200+ followers on all three
platforms before an account can join or run a paid campaign, and
TrendRush (the owner's clip-reposting account) doesn't have that yet.
Set up the business first:

```
npm run db:register-business -- trendrush "TrendRush"
npm run db:set-followers -- trendrush tiktok 40 trendrush.clips
```

Counts can also be updated directly from the dashboard's "Growth" tab
(`/growth`), which shows TrendRush's progress toward the 200 threshold
on each platform (that threshold is a UI-level constant in the
dashboard, not enforced by this table) alongside Sproutlight's own
account growth, tracked the same way but without the eligibility
framing — Sproutlight isn't seeking Promote.fun campaigns.
