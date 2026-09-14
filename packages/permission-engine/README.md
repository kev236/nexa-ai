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
- Spending limits / autonomy levels above 1: not implemented. Every
  request that reaches a registered executor becomes `pending_approval`,
  full stop — matching the project's default-autonomy-is-1 rule. Don't
  add auto-execute paths here without an explicit owner decision recorded
  in config, per that same rule.
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
