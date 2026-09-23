# @nexa-ai/permission-engine

The one chokepoint every agent action passes through. See
`docs/plan-001-foundations.md` section 3b at the repo root for the full
design rationale — this file only covers what's specific to reading the
code.

## Why `exports` only lists `.`

`package.json#exports` maps `.` to `./dist/index.js` — built output, not
`src/` directly. That's not the security boundary (see below); it's
because Turbopack (the dashboard's bundler) doesn't resolve the
`.js`-suffixed relative imports NodeNext requires in unbuilt TS source the
way `tsc`/Node's own ESM loader do. Run `npm run build` here (or `npm run
build:permission-engine` from the repo root) before anything that
consumes this package as a dependency — `npm test` doesn't need it, since
tests import `../src/*.ts` directly.

`dist/executors/**` is deliberately absent from the `exports` map — only
`.` is listed. Node's package resolution refuses a deep import into an
unlisted subpath from any other workspace package — so `import {
registerExecutor } from '@nexa-ai/permission-engine/executors/registry'`
fails to resolve from outside this package, not because of a lint rule,
but because there is no route to it. That's one of four independent
layers behind the "no module outside the approved execution path may
import a credential-holding client" invariant; `tools/import-boundary/`
(repo root) is the second layer, catching violations that don't even try
to go through package resolution (e.g. a relative
`../../permission-engine/src/executors/...` reach-around — and now also
proven against a real consumer: `packages/dashboard` is scanned by that
same check and only ever imports this package by name, never `pg`
directly). See the plan doc for the other two (no credentials in the
agent process; network egress denial).

Code inside this package (including its own tests) can still import
`src/executors/**` by relative path — that's expected. The boundary is
about code *outside* this package, not within it.

## What's here vs. what isn't yet

- `requestAction` / `resolveApproval`: implemented, tested, exported.
- Executors: `noop` (auto-registered on import, for testing the approve →
  execute path shape) and `send_email` (step 6 — see below, NOT
  auto-registered). Stripe (step 7) is read-only observability, not an
  executor — nothing writes to it, so there's no `charge`/`refund`
  actionType to register. Other real executors arrive with later steps,
  once there's something for them to call.
- Audit log / approval storage: `AuditLogStore` and `ApprovalStore` are
  interfaces, exactly so a real implementation could be a drop-in — which
  it now is. `createPermissionEngine()` still defaults to the in-memory
  ones (used by most of the test suite for isolation); `PostgresAuditLogStore`
  / `PostgresApprovalStore` (`src/audit/postgresStore.ts`,
  `src/approvals/postgresStore.ts`) are the real ones, exercised against
  an actual database in `test/postgresStore.test.ts` — nothing in
  `engine.ts` changed to make that work. Schema and a forward-only
  migration runner are in `db/`; see its own notes for what's
  deliberately not modeled yet (`decisions` exists but nothing writes to
  it; `approvals` doesn't yet carry risk/alternatives/recommendation).
  `src/db.ts` holds the shared connection pool, read from `DATABASE_URL` —
  see `.env.example` at the repo root.
- Approval policy: since step 18, every request auto-executes unless it
  carries an `expectedCost` (money) — see that step below. Steps 11 and
  13 (autonomy levels, spending-cap-gated auto-approval) were the
  original, narrower mechanism this replaced; their bullets stay below
  as a historical record of how the system got here, not current
  behavior.
- Owner accounts / login: `verifyOwnerCredentials` and `OwnerStore`
  (`src/owners/`) exist and are consumed by `packages/dashboard`. There is
  no `create` on `OwnerStore` on purpose — accounts are created only by
  `db/createOwner.mjs`, run directly by a trusted operator; there is no
  self-service signup path through the application.
- Adapters (`src/adapters/`, step 4): `BusinessAdapter` is the interface
  from the plan doc's section 3c. `NexaLabsAdapter` is the first (and
  only) implementation — `backfill()`/`observe()` read nexalabs' Sanity
  waitlist/contactMessage documents; `listActions()` is empty and
  `execute()` always throws, because there's no approved action type yet
  for it to perform. `registerWebhook` (the interface's optional push
  path) isn't implemented on this adapter yet — polling first, per the
  build order. `engine.ingestEvents(adapter, businessId, mode, since?)`
  writes what an adapter observes into `EventStore`
  (`src/events/`), idempotently on `(business_id, source, external_id)` —
  re-running backfill over the same range inserts nothing twice. Credentials
  (`SANITY_PROJECT_ID`/`DATASET`/`READ_TOKEN`) are read only by
  `createNexaLabsAdapter()`, the factory — the adapter class itself never
  touches `process.env`, taking a client in its constructor instead
  (`test/nexaLabsAdapter.test.ts` exercises it with a fake one, no network).
- The first agent (`src/agents/waitlistTriageAgent.ts`, step 5):
  `triageEvent(client, event)` drafts a reply via Claude (`claude-opus-5`,
  the one place the model is named — `src/llm/client.ts`), forced through
  a single tool call (`tool_choice`) so the result is always structured
  data, never prose to parse. The system prompt is a versioned file
  (`prompts/waitlist-triage.md`), not a string literal, per this
  project's own convention. `DecisionStore` (`src/decisions/`) records
  the reasoning and links it to the source event
  (`decisions.event_id`, migration `0009`) so the runner script can skip
  events it's already triaged. Both the LLM client and the adapter live
  inside this package's `src/`, same boundary as everything else — an
  agent calling out to Claude is still "a module holding a credential,"
  so it stays inside the approved execution path, never in a future
  `packages/agents/` outside it.
- The first real execute capability (`src/executors/sendEmail.ts`, step
  6): approving a `send_email` decision now sends an actual email via
  Resend — a genuine behavior change from step 5, where approving only
  recorded a draft (`actionType: 'noop'`). Scoped to exactly one thing
  (send this already-drafted `{to, subject, body}`), still gated behind
  `requestAction`/`resolveApproval` like every other action; default
  autonomy level 1 still applies, so nothing sends without an explicit
  owner approval. The "from" address is per-business config
  (`businesses.config.emailFrom`, set via `db/setBusinessConfig.mjs`),
  never hardcoded — this executor stays business-agnostic, reading the
  address through `BusinessStore` (`src/businesses/`, same
  interface/memory/postgres shape as every other store here).
  `registerSendEmailExecutor()` reads `RESEND_API_KEY` and wires the real
  Resend client and `PostgresBusinessStore` — unlike `noop`, it is NOT
  called on import (see `src/executors/noop.ts` vs `sendEmail.ts`),
  because it needs real credentials and a real database to construct.
  Every process that wants `send_email` to actually execute must call it
  itself: `db/runWaitlistTriage.mjs` does, and so does
  `packages/dashboard/src/lib/engine.ts` (a separate process — the
  executor registry is per-process and in-memory, so registering it in
  one process doesn't register it in another). The dashboard catches the
  error from a missing `RESEND_API_KEY` rather than letting it crash
  `getEngine()` — an unregistered executor already denies safely
  (`engine.ts`'s own handling), so a missing key degrades to "send_email
  approvals get denied," not "the whole dashboard is down."
- Read-only Stripe view (`NexaLabsAdapter.listTransactions()`, step 7):
  lists charges/refunds/payouts (a single page each, limit 100 — same
  "prove the shape" effort level as the Sanity side) and maps them into
  `ObservedTransaction` (`src/adapters/types.ts`), a narrower, typed
  sibling of `ObservedEvent` matching the `transactions` table's columns
  rather than the free-form `events` one. `listTransactions` is optional
  on `BusinessAdapter` — only an adapter backed by a payment processor
  implements it; `engine.ingestTransactions(adapter, businessId, since?)`
  throws a clear error if called against one that doesn't. Idempotent on
  `(business_id, external_ref)`, same convention as events.
  `STRIPE_SECRET_KEY` is optional at the adapter level too — without it,
  `NexaLabsAdapter` still works for Sanity events, `listTransactions()`
  just throws when called (`createNexaLabsAdapter()`'s doing, never
  `process.env` read inside the adapter class itself, same pattern as
  every other credential here). This is observability only: nothing in
  this codebase creates a charge, refund, or payout — see the plan doc's
  build order, step 7, and its "no write path to Stripe" deferral.
- A second, additive money source: a watched crypto wallet's USDC
  transfers on Ethereum mainnet — for accepting payment without needing
  a KVK the way a live Stripe account would. `listTransactions()` merges
  results from whichever of Stripe / the wallet watcher are configured
  (both, either, or neither — neither throws the same "no payment source
  configured" error as before). The watcher itself
  (`EtherscanClient`/`CryptoWalletConfig` in `nexaLabsAdapter.ts`) is a
  plain HTTP GET against Etherscan's `tokentx` endpoint — no SDK, since
  it's one endpoint — filtered to USDC's mainnet contract (a hardcoded
  constant, `USDC_MAINNET_CONTRACT`; not configurable, since the chain
  and token were a deliberate choice, not something to genericize ahead
  of a second one existing). An incoming transfer maps to `type:
  'charge'`, outgoing to `type: 'payout'` — there's no way to tell a
  genuine refund from any other outgoing transfer just by watching an
  address, so refunds aren't distinguished on this source, unlike
  Stripe's. `amountCents` treats USDC 1:1 with USD cents (it's a
  USD-pegged stablecoin). Needs both `ETHERSCAN_API_KEY` (a free key
  from etherscan.io/apis) and `WALLET_ADDRESS` set — either alone leaves
  the watcher unconfigured, same "optional, throws its own clear error"
  shape as Stripe. This doesn't change what "observability only" means:
  nothing here signs a transaction or moves funds, it only watches a
  wallet the owner controls independently.
- Step 8 — closing the manual-only loop: `AuditLogStore.listByBusiness()`
  (most-recent-first activity feed), `BusinessStore.getBySlug()` +
  `BusinessRecord`, and a new read-only `AgentStore`
  (`getByKey`/`listByBusiness`) — all added so a caller outside a
  `db/*.mjs` script (which can use `pg` directly) can resolve a business
  or agent by its stable identifier without raw SQL; `packages/dashboard`
  is exactly that caller, for both its new Activity page and its cron
  route. `runWaitlistTriageOnce()` (`src/agents/runWaitlistTriage.ts`) is
  the triage-and-submit loop extracted out of
  `db/runWaitlistTriage.mjs`, so the CLI script and the dashboard's
  scheduled cron route (`packages/dashboard/src/app/api/cron/poll/`)
  call the exact same logic instead of two copies quietly drifting.
  Bounded per `readme.md`'s "Agents" section — every run takes an
  optional `{ maxActions, timeoutMs }` (defaults 20 / 60s) and reports
  `stoppedReason` if it hit one; a token budget is NOT enforced yet,
  since `completeWithTool()`/`triageEvent()` don't surface per-call
  usage to sum against one — flagged, not silently skipped.
- Step 9 — a push path for events: `NexaLabsAdapter.handleSanityWebhook(rawBody,
  signatureHeader)` verifies and translates an inbound Sanity webhook
  delivery into `ObservedEvent[]`, and `engine.ingestWebhookEvent(businessId,
  event)` records one (tagged `ingestion_mode: 'webhook'`, idempotent on
  the same `(business_id, source, external_id)` as every other path).
  This is the webhook that actually delivers "faster than a poll
  interval" — the plan doc originally named Resend/Stripe webhooks for
  that, but Resend only reports the delivery status of email this
  system already sent; it can't report a *new* lead. Verification is
  via the official `@sanity/webhook` package (`isValidSignature`), not
  a hand-rolled HMAC comparison — a forged webhook could otherwise
  inject a fabricated customer message that gets drafted and eventually
  sent, so this is genuinely security-sensitive, and the package also
  enforces a timestamp tolerance (replay protection) that a hand-rolled
  version would need to reimplement correctly too. The webhook path is
  more defensive than the poll path about payload shape — poll trusts
  its own GROQ filter's `_type`, but a webhook's filter is configured
  by a human in Sanity's UI, so `handleSanityWebhook` rejects anything
  that isn't exactly `{_id, _type: 'waitlist' | 'contactMessage',
  createdAt, ...}` rather than let a misconfigured filter silently
  miscategorize some other document type. `SANITY_WEBHOOK_SECRET` is
  optional, same shape as every other credential here — without it,
  polling still works, `handleSanityWebhook()` just throws its own
  clear error. `createNexaLabsAdapter()` now returns the concrete
  `NexaLabsAdapter` class rather than the `BusinessAdapter` interface,
  since this method isn't generic enough to belong on the interface —
  a future adapter's webhook source won't be Sanity.
- Step 10 — owner notification: a new `Notifier` interface
  (`src/notifications/notifier.ts`), one method,
  `notifyPendingApproval(request, approvalId)`, called from
  `requestAction()` whenever it produces a `pending_approval` outcome —
  never on a request-time denial, since there's nothing for an owner to
  do about those. `notifier` is an optional `PermissionEngineDeps`
  field, same shape as every store; unset means no attempt, not an
  error. A failure inside a *configured* notifier is caught and logged
  by `requestAction()` itself, not swallowed inside the notifier — a
  fake notifier in tests should still be able to throw predictably, and
  a real send failure is worth a log line, not silence. This is why
  `createEmailNotifier()` checks Resend's own `{data, error}` response
  and throws on `error` rather than treating "the API call didn't
  reject" as success.
  `src/notifications/emailNotifier.ts`'s `createEmailNotifier(resend,
  ownerStore, businessStore)` emails every row from the new
  `OwnerStore.listAll()`, from the business's configured
  `config.emailFrom` (same key `send_email` already reads — no new
  config). One email per pending approval, not a digest — reconsider
  only if real volume ever makes that noisy. Content is deliberately
  thin (reasoning + a link, not the raw payload) per `readme.md`'s
  "Personal data" section — a payload can carry a customer's name/
  email/message, and full detail is one already-access-controlled
  dashboard visit away. `createResendEmailNotifier()` is the real-
  credentials factory, same shape as `registerSendEmailExecutor()`
  (throws if `RESEND_API_KEY` is unset; the caller decides that's
  non-fatal and catches it — see the dashboard's engine singleton).
- Step 11 — autonomy level 2, one proven action type auto-executing
  (**superseded by step 18** — `agents.autonomy_level` and
  `config.autoApproveMinConfidence` no longer exist; kept below as the
  historical record of the mechanism step 18 replaced): a
  new `ActionRequest.confidence?: number` (0-1, validated in
  `validate.ts`) lets an agent report how sure it is a draft is
  send-ready — `runWaitlistTriageOnce()` now threads the triage LLM's own
  confidence score through. `requestAction()` checks
  `shouldAutoApprove()` before creating a `pending_approval`: it looks up
  the agent (`AgentStore.getById()`, new), and only auto-executes if
  *both* `agents.autonomy_level >= 2` *and* `config.autoApproveMinConfidence`
  are set and the request's confidence clears that threshold — either
  condition alone does nothing, on purpose, so promoting an agent can't
  happen by accident (`db/setAgentAutonomy.mjs` sets both together, and
  refuses to set a level >= 2 without a threshold). This still reads as
  "nobody but the owner approves anything" (`readme.md`'s Approvals
  section): the owner pre-authorizes a narrow, proven action type in
  config — a real decision — rather than the system deciding on its own;
  see the same section's "Promoting a single narrow action type to a
  higher level is an owner decision made in config, never a code
  default." Auto-approval reuses the exact same `resolveApproval()`
  execute path a human's dashboard click uses — no second code path to
  keep in sync — just with `resolvedBy` omitted. `ApprovalStore.resolve()`'s
  `resolvedBy` is now optional throughout (`approvals.resolved_by` has a
  real FK to `owners(id)`, so a synthetic "system" value was never an
  option); `resolved_by IS NULL AND status = 'approved'` is the
  intentional, documented signal that an approval was auto-resolved by
  policy rather than a person — no other code path produces that
  combination. The owner is never notified for something already
  auto-approved (nothing to review), but still is for the same agent
  falling back to `pending_approval` (low confidence, or an inactive
  agent, or autonomy level 1). The check fails closed: any error reading
  agent config is caught and logged, and the request proceeds as
  `pending_approval` rather than either auto-approving or crashing the
  whole `requestAction()` call. New `ApprovalStore.listByBusiness()`
  (most-recent-first, mirrors `AuditLogStore.listByBusiness()`) lets a
  caller see how an approval was actually resolved —
  `packages/dashboard`'s Activity page uses it to label each executed
  action "approved by owner" or "auto-approved by policy," so
  auto-approval stays visible to the owner rather than invisible.
  Deliberately out of scope for this step: a UI to change autonomy level
  from the dashboard (still a `db/setAgentAutonomy.mjs` operator action,
  same trust level as `db/createOwner.mjs`), and per-action-type autonomy
  finer than "this whole agent" (there's only one action type per agent
  today, so the distinction doesn't exist yet).
- Step 12 — crash recovery, readme.md's "Failure and retries": "a crashed
  or killed run leaves its audit row marked [abandoned]" was a stated
  invariant with no implementation (flagged since step 8). The real gap:
  `requestAction()` writes an `audit_log` row (`recordRequested`), then a
  moment later writes a matching `approvals` row (`createPending`) — a
  process killed in exactly that window leaves the audit row stuck at
  `'requested'` forever, with no approval for a human to see in the
  dashboard queue and no code path that would ever revisit it. New
  `AuditLogStore.listStaleRequested(olderThanMs, limit?)` finds
  `'requested'` rows older than a threshold; new
  `ApprovalStore.getByAuditId(auditId)` (backed by a new unique index,
  `approvals_audit_id_idx` — `createPending()` writes exactly one
  approval per audit row, ever, so this documents and enforces a real
  1:1) tells "no approval was ever created" (the crash) apart from "one
  exists and is still legitimately pending" (an ordinary queue item the
  owner hasn't reviewed yet — never touched). `reapAbandonedRequests(olderThanMs?,
  limit?)` on `PermissionEngine` does the join between the two and calls
  `AuditLogStore.recordAbandoned()`, a new terminal status alongside
  `denied`/`executed` (migration `0011`, `abandoned_reason` column
  mirroring `denied_reason`). Deliberately not part of `requestAction()`
  itself — the crash this recovers from is a process dying mid-call, so
  nothing inside that same call could ever detect it; it's called
  periodically instead (`packages/dashboard`'s cron route, alongside the
  triage run — see that package's README).
- Step 13 — spending limits (**removed by step 18** — money now always
  requires an owner decision regardless of amount, so a cap gating
  *auto*-approval has nothing left to gate; `src/money/` and
  `test/spendingLimit.test.ts` no longer exist, kept below as the
  historical record), readme.md's Money section: "spend is
  measured against the ledger plus outstanding unconsumed grants, so two
  concurrent requests cannot both slip under the same cap." A cap only
  needs to constrain the one place this system could spend money
  *unsupervised* — autonomy level 2's auto-approve path (step 11); a
  normal `pending_approval` already always waits for a human who sees
  the cost before clicking Approve, so a cap doesn't gate that path.
  `businesses.config.spendingLimitCents` / `spendingLimitCurrency` /
  `spendingLimitWindowHours` (`src/money/spendingLimit.ts`'s
  `readSpendingLimitConfig()`, set via the existing generic
  `db:set-business-config` — no new script) must all be present and
  well-formed together, same "two independent values, no accidental
  default" shape as autonomy level 2 itself; any one missing means no
  cap is enforced, not a crash. When a request carries an `expectedCost`
  and a cap is configured, `shouldAutoApprove()` additionally requires
  `sumExecutedCost(businessId, currency, windowMs)` (new on
  `AuditLogStore` — the ledger: already-`executed` spend, resolved
  within the window) plus `sumPendingCost(businessId, currency)` (new on
  `ApprovalStore` — the outstanding grants: every currently-`pending`
  approval's cost) to stay at or under the cap. `createPending()` always
  runs before `shouldAutoApprove()` in `requestAction()`, so this
  request's own cost is already inside `sumPendingCost` by the time the
  check runs — no double-counting, and exactly what makes the check
  race-safe: two concurrent requests each create their pending grant
  first, so whichever's check runs second always sees the other's
  already counted (`test/spendingLimit.test.ts` exercises this with a
  real `Promise.all` of two concurrent `requestAction()` calls, not just
  sequential logic). A cap in a different currency than the request
  fails closed (denies auto-approval, invariant #8) rather than guessing
  an FX rate. Nothing in this codebase sets `expectedCost` on a real
  action yet (`send_email` has no direct dollar cost) — this is real,
  tested infrastructure ready for the first action type that does,
  matching the same "build the mechanism generically, not against one
  hardcoded case" shape as step 11.
- Step 14 — a second agent: `src/agents/transactionReviewAgent.ts`'s
  `reviewTransaction(client, transaction)`, same shape as step 5's
  `triageEvent()` (forced tool call via `completeWithTool`, a versioned
  prompt file — `prompts/transaction-review.md`, not a string literal)
  but reviewing money movement instead of drafting customer replies: it
  reads one `transactions` row (Stripe or the crypto wallet, step 7) and
  decides whether it's routine or worth a proactive alert to the owner.
  It never contacts a customer and never moves money — same
  default-autonomy-level-1 shape as every other agent here, an alert is
  drafted and held for the owner to approve, not sent. New
  `TransactionStore.listUnreviewed(businessId, limit?)`
  (`transactions.decision_id IS NULL`) and `.linkDecision(transactionId,
  decisionId)` needed no migration — `decision_id` has existed on
  `transactions` since step 7's migration
  (`0010`), unused until this agent had reasoning to link. Unlike
  event triage (where `decisions.event_id` points forward to what's
  being decided about), a transaction is reviewed after the fact, so
  the pointer runs the other way: `transactions.decision_id` is set
  once a decision exists, dropping that row out of `listUnreviewed()`.
  `src/agents/runTransactionReview.ts`'s `runTransactionReviewOnce()` is
  the run loop (same `maxActions`/`timeoutMs` bounds as
  `runWaitlistTriageOnce()`, readme.md's "Agents" section) — every
  unreviewed transaction gets a `decisions` row recorded regardless of
  the outcome (`actionType: 'send_email'` when flagged, `'none'` when
  judged routine), but only a flagged one becomes a `requestAction()`
  call; a routine transaction has nothing for a human to approve about
  "this was fine," so no audit-log noise is created for it.
  `db/runTransactionReview.mjs` (CLI, `npm run
  db:run-transaction-review`) and
  `packages/dashboard/src/lib/transactionReview.ts` (called from the
  cron route, same shape as `triggerWaitlistTriage()`) both send the
  drafted alert to the business's first registered owner
  (`OwnerStore.listAll()`/`SELECT ... ORDER BY created_at ASC LIMIT 1`
  respectively) — this system has exactly one owner today, so "first"
  is unambiguous; a future multi-owner business would need this
  reconsidered. Unlike the waitlist-triage agent, this one registering
  is optional per business — `triggerTransactionReview()` reports
  `{ skipped: '...' }` rather than throwing when no `transaction-review`
  agent is registered, since reviewing transactions only makes sense
  once Stripe or the crypto wallet is actually configured. Verified
  against real Postgres and the real Claude API (`db:run-transaction-review`
  against the dev database's real, already-ingested Stripe/crypto
  transactions) — both judged routine and correctly produced zero
  pending approvals, with sensible per-transaction reasoning recorded in
  `decisions`; the "worth flagging" path is covered by a fake-client
  Postgres integration test instead, since forcing that outcome from the
  real model isn't reliable to script.
- Step 15 — the opportunity-scoring format: the owner's own "empire OS"
  vision doc (not part of this repo) sketched a large autonomous
  business-discovery/launch pipeline; what was actually asked for was
  much narrower — just its 12-dimension scoring format, as a manual tool
  in the dashboard. `src/opportunities/scoring.ts`'s
  `OpportunityScores`/`SCORE_DIMENSIONS` defines the rubric — every
  dimension is on the same 0-100 "how favorable is this" scale (so a
  high Competition score means *little* competitive pressure, not a
  high literal amount of it), which is what makes `computeTotalScore()`
  a defensible plain average across all 12: the doc gives no explicit
  weights, and inventing a weighting scheme would be presenting a guess
  as a formula. `assertOpportunityScores()` requires every dimension,
  finite, 0-100 — thrown, never silently clamped or defaulted.
  `OpportunityStore` (`create`/`update`/`setStatus`/`get`/`list`, both
  in-memory and Postgres-backed — migration `0012`) is a new kind of
  store in this codebase: no agent or executor ever touches it, so
  unlike every other write path here it does not go through
  `requestAction()`/approvals — it's pure owner-authored notes, same
  trust level as an owner account (`OwnerStore`), gated only by the
  dashboard's existing session auth. No `business_id` either, same
  deliberate exception as `owners` (see that migration's comment) — an
  opportunity describes a business that doesn't exist yet, so it isn't
  scoped to one of the (currently one) existing businesses.
  `totalScore` is computed and stored server-side on every write, never
  trusted from the caller. Verified live end to end against real
  Postgres and a real browser: created an opportunity (all 12 dimensions
  at 80 → 80/100), edited it (one dimension 80→20 → recomputed to
  75/100, matching (11×80+20)/12 exactly), archived it, and reopened it.
- Step 16 — the front half of a second business's content pipeline: the
  owner shared a much larger "autonomous content engine" doc for
  Promote.fun campaigns (video generation, multi-platform publishing,
  Redis/BullMQ workers, Docker) — scoped down to what's actually
  buildable this way: Campaign import + Claude-generated, scored
  creative concepts, no video, no publishing, no new infrastructure.
  Promote.fun is registered as a real second `businesses` row
  (`db/registerBusiness.mjs` — the generic operator tool `db/seed.mjs`
  never grew into, since seed.mjs stays specifically about the dev
  bootstrap), proving invariant #4's "write it as though there are
  forty businesses" for the first time with an actual second one.
  `src/agents/campaignAgent.ts`'s `normalizeCampaign()` turns raw
  campaign text (pasted brief, CSV row, manual entry — never scraped;
  Promote.fun has no official API) into `CampaignStore`'s structured
  shape (migration `0013`), with "never invent campaign information" as
  the prompt's central rule — an unstated field comes back empty, not
  guessed. `src/agents/creativeAgent.ts`'s `generateContentConcepts()`
  reads one campaign and generates concepts (six per run — the vision
  doc's own "20 hooks + 10 concepts + 5 scripts + 5 CTAs + 5 captions"
  as separate arrays don't say which hook goes with which script, so
  this combines each into one scored unit instead: hook, script outline,
  CTA, caption, visual note, hashtags, and the doc's own six-dimension
  scoring rubric). The weighted total score
  (`src/contentConcepts/types.ts`'s `computeConceptScore()`, the doc's
  exact hook×0.25 + retention×0.25 + conversion×0.20 + shareability×0.15
  + clarity×0.10 + offerFit×0.05 formula) and which concepts get marked
  `recommended` are both computed deterministically after the model
  responds, never trusted as arithmetic the model did itself — "use
  deterministic code for calculations, use AI only where reasoning is
  valuable," the doc's own section 24. Neither agent is routed through
  `requestAction()`/approvals — drafting campaign data or creative
  concepts has no side effect yet for a human to approve, same reasoning
  as step 15's opportunities; that changes the moment a later phase adds
  an executor that actually publishes something.

  A real bug only surfaced by testing against the real API, not the fake
  clients unit tests use: the Creative Agent's six-concept, many-field
  response tripped the default 4096-token cap on `completeWithTool()`
  and came back with `concepts` (or `reasoning`/`confidence`) silently
  missing — the truncated tool call still parsed as valid-looking JSON,
  it just didn't have everything. `completeWithTool()` now takes an
  optional `maxTokens` (the Creative Agent passes 8192) and explicitly
  throws on `stop_reason === 'max_tokens'` rather than letting a caller
  read past a hole in the response; `creativeAgent.ts` also validates
  the result's shape before using it at all — "validate all AI output
  against schemas before processing it," per the doc's own section 9,
  a real requirement this had skipped until real testing found the gap
  it was written to prevent.

  Verified live end to end against real Postgres and the real Claude
  API: imported a real Nexa SiteAudit campaign brief (correctly
  extracted product/audience/benefits/forbidden-claims, including a
  compliance-critical "don't promise ranking improvements" rule),
  generated six real scored concepts (each respecting the campaign's
  allowed/forbidden claims, with zero fabricated statistics or
  testimonials — the model's own reasoning explicitly flagged what it
  deliberately avoided claiming), and confirmed the weighted score and
  `recommended` flag both matched the deterministic formula by hand.

- Step 17 — an agent for step 15's opportunities table: the owner asked
  for a step toward "an ultimate managing/business-making AI" that
  didn't try to build the whole thing at once. `src/agents/
  opportunityDiscoveryAgent.ts`'s `discoverOpportunities()` reads the
  existing opportunities list (so it doesn't repeat one already
  recorded) and proposes up to 3 new ones, scored across the same 12
  dimensions step 15's owner-authored form uses — `computeTotalScore()`
  is the same function either way, never trusted as arithmetic the model
  did itself. The prompt (`prompts/opportunity-discovery.md`) is
  explicit that this model has no live search/trend/analytics access:
  it's told never to claim something is "trending now" or cite a
  statistic it wasn't given, and to propose fewer ideas rather than
  invent grounding for a weak one — reasoned brainstorming, not a live
  research pipeline, matching invariant #6 ("never fabricate... a
  feature, a statistic").

  Unlike steps 15/16's writes, a proposal *does* go through
  `requestAction()` — a new `propose_opportunity` action type
  (`src/executors/proposeOpportunity.ts`) writes into the same
  `OpportunityStore.create()` steps 15 used directly, with the calling
  `context.agentId` (registry's `ExecutorFn` context gained this field
  this step) recorded on the row as `proposedByAgentId` (migration
  `0015`, `opportunities.proposed_by_agent_id`). Routing through
  `requestAction()` for something that never needed approval — writing
  an opportunity spends no money and contacts no one — is deliberate:
  it's what puts every proposal on the audit trail (invariant #2)
  alongside every other agent's actions, and it's what makes step 18's
  auto-approve-by-default policy visibly apply to this agent's writes
  too, not a special case. `src/agents/runOpportunityDiscovery.ts`'s
  `runOpportunityDiscoveryOnce()` is the one run: discover, then submit
  each proposal individually (separate audit rows, not one bundled
  write). `packages/dashboard/src/app/opportunities/actions.ts` wires a
  "Discover opportunities" button on the dashboard; the CLI equivalent
  is `npm run db:discover-opportunities -- <business-slug>
  [agent-key]`, needing `npm run db:register-agent -- nexa-labs
  opportunity-discovery "..."` first — unlike the Creative Agent's
  optional `agentId`, this one is required, since `requestAction()`
  needs a real, active agent row to auto-approve against.

  Verified live end to end against real Postgres, a real browser, and
  the real Claude API (both via `db:discover-opportunities` and by
  actually clicking the dashboard button): three real proposals per run,
  genuinely distinct and grounded (a DPA/subprocessor-change monitor, a
  documentation-link-rot checker, a SaaS auto-renewal tracker — not
  generic "AI productivity app" filler), each landing in Postgres with
  `proposed_by_agent_id` set, auto-executed with no pending approval
  left behind, and correctly badged "discovered" on the dashboard to
  distinguish them from owner-authored rows.

  Building this step surfaced a real, pre-existing bug affecting every
  prompt-loading agent in this package (waitlist-triage, transaction-
  review, campaign normalization, creative concepts, and this one):
  `promptPath()`'s `fileURLToPath(new URL('../../prompts/...',
  import.meta.url))` pattern — previously made *lazy* (resolved inside
  the function, not at module load) specifically because "a bundler
  rewrites import.meta.url in ways that break this resolution," per
  waitlistTriageAgent.ts's own pre-existing comment — was never actually
  fixed, only kept from crashing on *import*. Calling any of these
  agents through a real Next.js dashboard server action (not a CLI
  script, not a test — first caught by actually clicking the "Discover
  opportunities" button in a real browser) threw `"path" argument must
  be of type string or an instance of URL. Received an instance of
  URL` — Turbopack specifically rewrites the two-argument `new URL(path,
  import.meta.url)` shape for static asset resolution, and the rewritten
  value isn't a real `URL` instance to `fileURLToPath()`. Fixed in all
  five files by converting `import.meta.url` to a string first
  (`fileURLToPath(import.meta.url)`) and joining the prompt's relative
  path with plain `node:path` functions instead of a second `new URL()`
  call — confirmed fixed live for both this agent and the Creative
  Agent's "Generate concepts" button.

  A second, separate bug in the same area surfaced once the first was
  fixed and actually deployed: production still threw, now `ENOENT: no
  such file or directory, open '/var/task/packages/permission-engine/
  prompts/opportunity-discovery.md'`. The URL bug was a code bug; this
  one is a deployment/bundling one — Next.js's build-time file tracer
  (what decides which files a Vercel serverless function actually ships
  with) only sees files reached through a static `import`/`require`; a
  `readFileSync()` at a dynamically-computed path is invisible to it, so
  the entire `prompts/` directory was silently left out of every
  deployment, for all five agents, this whole time. `next dev`/`next
  build` running locally never surfaces this, since local runs just read
  the real filesystem — only Vercel's actual traced-and-copied runtime
  is missing the file. Fixed in `packages/dashboard/next.config.ts` via
  `outputFileTracingIncludes` (`{ '/**':
  ['../permission-engine/prompts/**'] }`) — Next's own documented escape
  hatch for exactly this "the tracer can't see this file but it's needed
  at runtime" case, rather than restructuring how five files load their
  prompts. Confirmed fixed by inspecting the actual build output: every
  page's `.next/server/app/**/page.js.nft.json` trace manifest lists all
  five `prompts/*.md` files after this change, none before it.

- Step 18 — approval policy simplified: the owner asked to remove
  approval for everything except spending money. `shouldAutoApprove()`
  (`engine.ts`) is now three lines — an active agent, and no
  `expectedCost` on the request — replacing step 11's opt-in
  autonomy-level-2-plus-confidence-threshold system entirely (not
  layered alongside it: `agents.autonomy_level` is dropped, migration
  `0014`, and `config.autoApproveMinConfidence` is no longer read by
  anything). Money is now an unconditional stop, not a cap-gated one —
  step 13's spending-limit ledger only ever gated *auto*-approval, and
  since a costed request never reaches that path anymore, `src/money/`
  and its tests were removed rather than left as dead code with no
  caller. "Audit before execute" (invariant #2) is unchanged: every
  action, auto- or owner-approved, still gets a pending approval row and
  an audit record before anything executes — only how fast a decision
  happens changed. `ExecutorFn`'s context gained `agentId` alongside
  `businessId` (`resolveApproval()` now passes both) — the first
  consumer is step 17's `propose_opportunity` executor, tagging who
  proposed an opportunity.

  This is a real, deliberate departure from "nobody but the owner
  approves anything" as it worked before — not from the invariant
  itself (the owner set this policy, same reasoning step 11's comment
  already made for a narrower version of the same idea), but from what
  it means in practice: replies drafted by the waitlist-triage agent now
  email real leads with zero review, and transaction-review alerts now
  email the owner immediately rather than waiting for an Approve click.
  Both agents' prompts (`prompts/waitlist-triage.md`,
  `prompts/transaction-review.md`) were rewritten to match — they no
  longer tell the model "a human reviews every draft before it goes
  anywhere," which was false the moment this shipped and would have
  encouraged the model to hedge less carefully than it now needs to.
  waitlist-triage's prompt specifically now asks for an honest holding
  reply instead of an invented detail when a message is ambiguous, since
  there's no human left to catch one.

  Two of this package's own CLI scripts (`db/runWaitlistTriage.mjs`,
  `db/runTransactionReview.mjs`) had never wired a real `agentStore` into
  their `createPermissionEngine()` call — harmless under the old
  default-pending policy (nothing auto-approved either way), but under
  this one it would have silently made every run behave as though no
  agent existed, permanently falling back to `pending_approval` no
  matter what. Fixed alongside this change, caught by running the full
  suite against real Postgres rather than by inspection.

- Step 19 — Sproutlight, a third business: AI-generated nursery rhymes
  and short stories for young children, the owner's rebuild of an
  earlier abandoned business (streamer-clip reposting — dropped for
  being both saturated and copyright-exposed) into an original,
  higher-audience, copyright-clean niche. **Revised by step 20**: the
  clip-reposting business wasn't fully dropped after all — the owner
  kept it running as TrendRush, a fourth business, alongside
  Sproutlight rather than instead of it; see that step for why. Scoped
  the same way step 16's
  Promote.fun work was scoped down from its own much larger doc: a
  Concept Agent only, no video/audio generation and no publishing —
  prove real output quality before committing to expensive, harder-to-
  undo generation infrastructure.
  `src/agents/storyConceptAgent.ts`'s `generateStoryConcept(client,
  theme, format)` turns one owner-submitted theme into a single,
  complete concept: title, age range, a full script (song lyrics or
  short-story narration), broken into scenes with a literal
  `visualDescription` per scene for a future visual-generation pass,
  plus an `educationalTakeaway` and a `safetyNotes` field. The prompt
  (`prompts/story-concept.md`) carries genuinely strict, explicit
  child-safety rules — nothing scary or unresolved, original characters
  and lyrics only (never another work's actual words, even a public-
  domain-feeling lullaby's), age-appropriate vocabulary, no product
  placement. `safetyNotes` exists because there's no reliable
  deterministic check for "is this too scary for a toddler" the way
  `computeTotalScore()` is deterministic for opportunities — the
  model's own explicit safety reasoning is what the human reviewer
  actually has to go on, so it's a required field, not an afterthought.
  `StoryConceptStore` (`src/storyConcepts/`, migration `0016`) doesn't
  go through `requestAction()`, same reasoning as step 16's
  CampaignStore/ContentConceptStore: no side effect exists yet for a
  human to approve. Dashboard gained a "Sproutlight" tab
  (`/story-concepts`) with a generate form and the full concept list,
  scenes expandable per card; CLI is `npm run db:generate-story-concept
  -- <business-slug> <song|story> <theme>`.

  Verified: schema validation via unit tests with a fake client matching
  the real tool schema (including a truncated-response case per every
  other agent's identical test), a real Postgres integration test, and
  the actual dashboard page rendered live in a browser against a real
  seeded row. Could not verify live model output quality this session —
  the sandbox's `ANTHROPIC_API_KEY` returned `401 authentication_error`
  when actually called (it worked earlier the same session for the
  Opportunity Discovery Agent, so it was likely rotated in between) —
  confirmed the failure surfaces cleanly through the dashboard's error
  state rather than crashing, but the owner still needs to run a real
  generation once against a valid key to judge actual concept quality
  before trusting this for real themes.

- Step 20 — Growth: real per-platform follower tracking, prompted by a
  concrete external constraint the owner surfaced — Promote.fun
  requires 200+ followers on YouTube, Instagram, *and* TikTok before an
  account can join or run a paid campaign. TrendRush (step 19's
  "dropped" clip-reposting business, actually kept running alongside
  Sproutlight rather than replaced by it) is the account working toward
  that; Sproutlight is growing its own new accounts too, just without
  seeking Promote.fun campaigns.
  `SocialAccountStore` (`src/socialAccounts/`, migration `0017`) is one
  row per `(business_id, platform)`, upserted by `setFollowerCount()` —
  same "plain owner-authored data" trust level as
  `OpportunityStore`/`CampaignStore`, so no `requestAction()`/approval:
  entering a follower count doesn't spend money, contact a customer, or
  do anything irreversible. `PLATFORMS` (`'youtube' | 'instagram' |
  'tiktok'`) is the one shared source of truth for the three platforms,
  exported from this package so the dashboard never repeats or drifts
  from that list.
  The 200-follower Promote.fun threshold itself is *not* stored or
  enforced here — it's a UI-level constant
  (`CAMPAIGN_ELIGIBILITY_THRESHOLD` in the dashboard's
  `app/growth/page.tsx`) computed against whatever `listByBusiness()`
  returns, the same way the opportunity-scoring format's constants live
  in `src/opportunities/scoring.ts` rather than the migration: this
  table just stores real numbers, a page decides what they mean.
  Dashboard gained a "Growth" tab (`/growth`) — one section per tracked
  business, a progress bar per platform toward the threshold (only
  rendered for TrendRush; Sproutlight's cards show plain counts), and
  an inline form per platform that writes through the same
  `setFollowerCount()`; CLI is `npm run db:set-followers --
  <business-slug> <platform> <count> [handle]`.

  Verified: memory-store unit tests, a real Postgres integration test
  (create, then a second call to the same platform upserts rather than
  duplicating, and an omitted handle keeps the one already on file), and
  the actual Growth page exercised live in a browser — logged in,
  updated a real follower count through the dashboard form, watched the
  progress bar and the "not eligible yet" → "promote.fun eligible" badge
  flip once all three platforms cleared 200 against a real seeded
  business, then reset the demo numbers back to 0 (real starting point,
  not left as test data).

- Step 23 — TrendRush's Clip Discovery Agent, chosen over two other
  candidate directions (a real content pipeline for Sproutlight's
  visuals, or a general hardening pass) when the owner picked it
  directly: TrendRush sits at 0 real followers with no content
  pipeline, so a tool that helps decide *which* clips are worth the
  time to repost serves the one goal Growth (step 20) already tracks —
  200 followers per platform to unlock Promote.fun campaigns.
  `src/agents/clipDiscoveryAgent.ts`'s `evaluateClip(client,
  sourceDescription, sourceUrl?)` reads one owner-submitted clip — a
  description and optionally a URL, never the video itself — and
  returns a scored evaluation: a `viralityScore` (0-100), a
  `copyrightRisk` (`'low' | 'medium' | 'high'`) with explicit
  `copyrightNotes`, one caption+hashtags per platform, a
  `recommendation` (`REPOST` / `RESEARCH FURTHER` / `SKIP`), and a
  `confidence`. The prompt (`prompts/clip-discovery.md`) treats
  copyright risk as the load-bearing field, not a formality: it
  explicitly instructs defaulting to `'high'` for a bare verbatim
  repost with no commentary or transformation, since this exact
  exposure is the real reason noted in this file's own step 19 history
  as part of why the original clip-reposting business was shelved
  before the owner brought it back as TrendRush (step 20). Reusing that
  same mistake without a check built in would have been worse than not
  building the feature at all.
  `ClipStore` (`src/clips/`, migration `0018`) doesn't go through
  `requestAction()`, same reasoning as
  Campaigns/ContentConcepts/StoryConcepts: no repost executor exists
  yet for a human to approve, just a written evaluation to review
  before spending time producing and posting anything. Dashboard
  gained a "Clips" tab (`/clips`) with a submission form and the full
  evaluation list, copyright risk shown as a color-coded badge (green/
  yellow/red, reusing the existing status-badge classes) and captions
  expandable per platform; CLI is `npm run db:discover-clip --
  <business-slug> <source-description> [source-url]`.

  Verified: schema-validation unit tests with a fake client (including
  an invalid-platform case and a truncated-response case, matching
  every other agent's identical coverage), a real Postgres integration
  test, and the actual `/clips` page rendered live in a browser against
  a real seeded row (color-coded risk badge, all three platform
  captions, expandable reasoning). Could not verify live model output
  quality this session — the sandbox's `ANTHROPIC_API_KEY` returned
  `401 authentication_error` (the same credential gap noted in step
  19's entry above) — confirmed the failure surfaces cleanly as a
  thrown error and through the dashboard form's existing error state
  rather than crashing, but the owner still needs to run a real
  evaluation once against a valid key to judge actual scoring quality
  before trusting this for a real repost decision.

- Step 27 — the repost executor step 23's own entry (and migration
  `0018`'s comment) flagged as missing: `post_clip_youtube`
  (`src/executors/postClipYoutube.ts`) uploads a real video to
  TrendRush's connected YouTube channel. Steps 24-26 (real per-platform
  follower sync, the YouTube OAuth consent flow, and Shopify dropshipping
  transactions) shipped in code between step 23 and this one without a
  matching README entry each — not backfilled here, out of scope for
  this step.

  The owner gave two explicit, back-to-back instructions this step is
  built around, both logged here because they're real departures from
  how this file previously described the system: first, that
  copyright-risk clips should still require an owner click rather than
  auto-posting (the design this step shipped with initially); then,
  superseding that within the same session, "I don't want anything in
  Nexa AI to draft, I want it to act fully on its own" — so the shipped
  behavior drops the risk-based gate entirely. Attaching a video file
  to an evaluated clip (at evaluation time, or later from the Clips
  page) posts it immediately, regardless of `copyrightRisk` or
  `recommendation`. This is a real, deliberate widening of step 18's
  already-permissive default (everything except money auto-executes) —
  it does not touch the money line itself, which the owner was
  separately asked to confirm and hadn't, as of this entry.
  `src/adapters/youtubeUploadAdapter.ts` does the real HTTP: a
  refresh-token exchange against Google's OAuth token endpoint, and a
  non-resumable `multipart/related` upload against the YouTube Data
  API's `videos.insert` (appropriate for TrendRush's short clips; a
  pipeline handling long-form video would want the resumable upload
  protocol instead). The executor (`createPostClipYoutubeExecutor`)
  refreshes an expiring/expired access token itself and persists the
  new one, refuses to double-post a clip that already has a
  `youtubeVideoId` (migration `0020`), and otherwise trusts its payload
  the same way every other executor does — the copyright judgment call
  happens one layer up, in the dashboard's `lib/clipPosting.ts`, which
  builds the YouTube title/description/tags from the clip's own
  `captions` array rather than re-deriving them.
  Scoped to YouTube only: Instagram and TikTok's own posting APIs both
  gate publishing behind a developer-app review process on their end —
  a real external dependency this code can't shortcut, not a design
  choice — `OAuthCredentialStore` already has room for both whenever
  that clears.
  Dashboard: `ClipForm` gained an optional video-file input; each
  evaluated clip on `/clips` shows a "posted" link once
  `youtubeVideoId` is set, a "Post to YouTube" file-attach form
  (`PostClipButton`) if the business's YouTube credential exists, or a
  "Connect YouTube" prompt if it doesn't.

  Google's own app-verification gate still applies regardless of any
  of this (see `start/route.ts`'s note from step 25): until this OAuth
  app passes Google's compliance audit, every upload comes back capped
  at `privacyStatus: 'private'` no matter what's requested — invisible
  to anyone but the owner's own account, so it does nothing toward the
  200-follower goal until that clears. Also unverified this step, and
  blocking in production regardless of that audit:
  `YOUTUBE_OAUTH_CLIENT_ID`/`YOUTUBE_OAUTH_CLIENT_SECRET` exist in
  `.env.example` but were not set in this environment's real `.env`, so
  the owner needs to add real values (a Google Cloud Console OAuth
  client) before any of this executes for real, and migration `0020`
  needs `npm run db:migrate` run against a reachable database — this
  sandbox's own `DATABASE_URL` timed out on every connection attempt,
  so nothing here was exercised against a real database this step.

  Verified: unit tests for the upload adapter (token refresh, a
  real-shaped multipart body, both failure paths) and the executor
  (upload + `markPosted`, an expired-token refresh that persists the
  new token, refusing a business with no YouTube credential, refusing
  a double-post, a malformed payload), all against fakes/mocked
  `fetch` — matching every other adapter/executor's identical test
  shape in this package. Full suite, lint, `tsc --noEmit`, the import-
  boundary check, and a real production build all pass. Could not run
  the migration or exercise the real upload/refresh HTTP calls against
  live Google or Postgres endpoints from this sandbox — both need a
  live run against a real environment before the owner trusts this for
  a real post.

- Step 28 — two owner-directed changes, both to TrendRush/Sproutlight's
  YouTube posting path.

  First, the copyright-risk gate that step 27 shipped with
  (`clips/actions.ts`'s `evaluateClipAction` only auto-posting a clip
  scored `copyrightRisk === 'low'`) is removed. The owner reconfirmed
  directly, after this file's own step 27 entry and `prompts/clip-discovery.md`
  both flagged the real legal exposure a bare repost carries (this
  exact risk is why an earlier version of the business was shelved,
  per that prompt's own text) and TrendRush's content direction was
  set to editing and reposting other creators' clips: every evaluated
  clip with a video attached now posts immediately regardless of
  `copyrightRisk` or `recommendation`, matching what
  `postClipToYoutubeAction` (the manual per-clip "Post to YouTube"
  button) already did unconditionally. `copyrightRisk` is still scored
  and shown on `/clips` — the model's own judgment call is still
  visible to the owner after the fact, it just no longer blocks
  anything. This is the owner's call to make about their own business,
  not something this file can resolve on the model's authority — it's
  logged here as a real, deliberate change from step 27's shipped
  behavior, same as step 27 logged its own change from what came
  before it.

  Second, `src/adapters/youtubeUploadAdapter.ts`'s `YouTubeVideoMetadata`
  gained a required `madeForKids` field, sent as the YouTube Data API's
  `status.selfDeclaredMadeForKids` on every upload. Not previously set
  at all, which defaults to *not* made for kids — the wrong default for
  Sproutlight, whose entire catalog (per the owner's direction, "child/
  nursery shorts/videos only on YouTube") is children's content and
  legally must be self-declared as such under COPPA once real uploads
  start. `postStoryConceptYoutube.ts` now hardcodes `true`;
  `postClipYoutube.ts` hardcodes `false` (TrendRush is never kids'
  content) — set per-executor rather than trusted from the request
  payload, so it can't be gotten wrong per-call. Sproutlight's posting
  path was already YouTube-only with no Instagram/TikTok cross-posting
  anywhere in the code, and `prompts/story-concept.md`'s existing
  safety rules already scope every generated concept to young
  children — both already matched the owner's direction with no
  further change needed.

  Verified: full test suite (including new/updated coverage for both
  changes — `youtubeUploadAdapter.test.ts` asserts
  `selfDeclaredMadeForKids` for both `true` and `false`; the two
  executor tests each assert their fixed value), lint, and
  `tsc --noEmit` all pass. Not exercised against a live YouTube upload
  from this sandbox, same limitation as step 27.

- Step 29 — TrendRush posts to Instagram and TikTok now, not just
  YouTube, per the owner's direct instruction. New: migration `0023`
  (per-platform posted-id columns on `clips`, plus `external_account_id`
  on `oauth_credentials`); `ClipStore.markPosted()` generalized from a
  YouTube-only signature to `(clipId, platform, externalId)`;
  `src/executors/postClipTiktok.ts` and `postClipInstagram.ts`;
  `src/adapters/tiktokUploadAdapter.ts` (the Content Posting API's
  init/upload/status flow) and `instagramAdapter.ts` (Facebook Login
  token exchange, Page/IG-account resolution, the container-based
  publish flow); `tiktokAdapter.ts`'s `exchangeCode` gained a required
  `codeVerifier` param (TikTok's posting API requires PKCE);
  `api/oauth/tiktok/` and `api/oauth/instagram/` start+callback routes,
  same shape as `api/oauth/youtube/`; `/clips` and `/growth` now show
  connect/post/posted state for all three platforms, not just YouTube.

  **This step is a real departure from how the rest of this codebase
  treats external API shapes.** Every previous OAuth/publish integration
  here (YouTube's, and `tiktokAdapter.ts`'s own original token-exchange
  code) was built only from the owner's own pasted API reference or a
  documentation page this environment could actually fetch — see
  `tiktokAdapter.ts`'s pre-step-29 comment, which held that line
  explicitly and named the risk of doing otherwise ("this project's own
  README describes the risk that shelved the original clip-reposting
  business once already"). `developers.tiktok.com` and
  `developers.facebook.com` are both blocked by this sandbox's network
  egress (confirmed via a direct fetch attempt, not assumed), so this
  step's TikTok Content Posting API and Instagram Graph API code —
  endpoint paths, scope names, request/response field names, PKCE and
  chunking requirements, the Facebook Login vs. "Instagram API with
  Instagram Login" choice — is built from several independent,
  cross-checked third-party 2026 integration guides instead. That's
  real signal (the same shapes appearing independently across unrelated
  sources), but it is not the standard this codebase held itself to
  before, and every adapter/route file carries its own comment saying
  so. Treat every exact field/endpoint name in `tiktokUploadAdapter.ts`,
  `instagramAdapter.ts`, and the two new OAuth route pairs as needing
  confirmation — against the real docs once this sandbox can reach
  them, or against a real first test post — before trusting it for a
  real account. This is exactly the kind of unverified-external-API
  risk the pre-step-29 standard existed to avoid; it was accepted here
  because "prepare everything, I'll add the real API credentials and
  test it myself later" makes that verification the owner's own next
  step regardless, not because the risk stopped mattering.

  Two structural differences from YouTube's posting path, not
  implementation details: Instagram's publish API needs a URL its own
  servers can fetch and never accepts raw bytes, so `postClipInstagram`
  takes a `videoUrl` rather than a video file/buffer — only usable when
  the owner pasted a video URL rather than uploading a file (see
  `videoInput.ts`'s `getPublicVideoUrl`); and Meta's own guidance
  (poll roughly once a minute for up to 5 minutes) doesn't fit inside a
  typical serverless function's time budget, so `postClipInstagram`
  polls faster for a shorter, configurable window and throws a clear
  error naming the container id if it isn't done in time, rather than
  blocking indefinitely.

  Also carried over from step 28: TikTok posting has no copyright-risk
  gate either, same reasoning and same owner instruction as YouTube's.
  An *unaudited* TikTok API client (the state this will be in until the
  owner's client passes TikTok's own review) is forced to `SELF_ONLY`
  regardless of what's requested, and real Instagram publishing beyond
  the app's own registered testers needs Meta's App Review for
  `instagram_content_publish` — both enforced by the platform itself,
  same shape as YouTube's own verification-gated Private cap.

  Verified: full test suite (new coverage for both adapters and both
  executors, plus the generalized `markPosted`), lint, `tsc --noEmit`,
  and the import-boundary check all pass. Not exercised against a live
  TikTok or Instagram account, or a real database (this migration's own
  columns included) — same sandbox limitations steps 27/28 already
  logged, now applying to three platforms instead of one.

- Step 30 — a new, small product: the Clip Scoring API. The owner asked
  for something that could earn a small amount of money in the
  background while the other businesses get finalized, without needing
  new hosting or a large new subsystem. `POST /api/v1/score-clip`
  wraps `evaluateClip()` (`agents/clipDiscoveryAgent.ts`) — the exact
  same scoring TrendRush's own `/clips` page already runs internally —
  for external callers, authenticated with a new `api_keys` row instead
  of a dashboard session.

  Deliberately not business-scoped: migration `0024` adds a standalone
  `api_keys` table (`id`, `name`, `key_hash`, `request_count`,
  `created_at`, `last_used_at`, `revoked_at`) with no `business_id` —
  `evaluateClip()` itself is a pure function with no store writes, so
  there's nothing TrendRush-specific to attach a key to, and this
  product's customers aren't TrendRush's own business data.
  `apiKeys/crypto.ts` generates a 256-bit key (`nexa_live_` prefix, a
  cosmetic recognizability convention, not part of the secret) and
  stores only its SHA-256 hash — a fast hash, not `password.ts`'s
  deliberately slow scrypt, since the security question here is
  different: scrypt exists to slow down brute-forcing a low-entropy
  human password, while a 256-bit random key has no meaningfully
  exploitable search space regardless of hash speed, and the lookup
  goes through an indexed equality query, not an app-level compare
  loop. The plaintext key is returned exactly once, at creation
  (`/api-keys`'s `CreateApiKeyForm`), and never stored or shown again.

  Billing is manual, deliberately: the owner generates a key after
  being paid outside this system (bank transfer, whatever) and revokes
  it if a customer stops paying. No Stripe or other payment integration
  was added here — real billing is a separate, later step, kept
  separate from "does the product work" on purpose.

  Verified: new `apiKeys.test.ts` (create/find/revoke/usage-tracking/
  ordering, including the same same-millisecond `createdAt` tie-
  breaking fix `clips/memoryStore.ts` and `audit/memoryStore.ts`
  already needed), full suite, lint, `tsc --noEmit`, the import-
  boundary check, and a real `next build` (the new `/api/v1/score-clip`
  route and `/api-keys` page both compile and appear in the route
  list) all pass. Not exercised against a live request or a real
  database — same sandbox limitation as every other step this session.

- Step 31 — the Clip Scoring API had no way for a stranger to find or
  understand it: only `/api-keys`, behind a dashboard login, existed.
  The owner asked for the fastest realistic path to an actual paying
  customer, given real constraints — no live payment processing (not
  KvK-registered), no audience-building shortcut for the other
  businesses' ad-revenue paths. This doesn't guarantee a sale; it
  removes the concrete blocker that made one impossible (nobody outside
  this dashboard could learn the product existed).

  New: migration `0025` adds `api_key_requests` (email, use_case,
  created_at, fulfilled_at) — a request-access inbox, deliberately
  separate from `api_keys` itself, since most requests never become a
  real key (spam, tire-kickers, a use case the owner declines) and
  carry fields a key has no reason to keep once issued.
  `/clip-api` is a genuinely public page (the one page in this app that
  doesn't call `verifySession()` — confirmed by `next build` rendering
  it `○` static, meaning Next.js itself detected no session dependency)
  with real product copy, a real request/response example matching
  `api/v1/score-clip`'s actual contract, and a request form
  (`requestApiKeyAccessAction`, also `verifySession()`-free, with a
  honeypot field against basic bot spam). `/api-keys` now shows pending
  requests above the key list — the thing its owner most needs to
  notice first — each with a one-click "generate key & mark fulfilled"
  action (`fulfillApiKeyRequestAction`) that does both in the same
  request instead of two separate manual steps.

  Verified: new `apiKeyRequests.test.ts`, full suite, lint,
  `tsc --noEmit`, the import-boundary check, and a real `next build`
  (confirming `/clip-api` renders static, and the new action/route
  surface compiles) all pass. Not exercised against a live request or
  a real database — same sandbox limitation as every other step this
  session.
