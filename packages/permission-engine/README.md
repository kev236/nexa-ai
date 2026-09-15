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
- Spending limits: not implemented. Autonomy levels above 1 are — see
  step 11 below; every other request still reaches a registered executor
  as `pending_approval`, matching the project's default-autonomy-is-1
  rule.
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
- Step 11 — autonomy level 2, one proven action type auto-executing: a
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
- Step 13 — spending limits, readme.md's Money section: "spend is
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
