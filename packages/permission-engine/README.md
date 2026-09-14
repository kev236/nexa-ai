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
  auto-registered). Other real executors (Stripe, more of Sanity) arrive
  with later steps, once there's something for them to call.
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
