# Plan 001: Foundations

Status: proposal, not implemented. Nothing in this document has been built.
No migrations, no permission engine code, no adapters exist yet.

---

## 1. What nexalabs actually is

Read end to end (50 commits, single contributor, ~5 weeks of history from the
commit log's language switch from Dutch to English onward).

**Bottom line: this is a marketing site with a waitlist form and a CMS.** It
is not a platform, not a SaaS with paying customers, and not something with
live products behind it. Say that plainly because the product names
("Nexa SiteAudit", "Nexa QuoteFlow", "Nexa InvoiceChaser") read like real
tools — they are copy on a page. There is no application code for any of
them anywhere in the repo. They're marketing fiction for products that don't
exist yet, wrapped in a lead-capture flow.

### Stack

- Next.js 16.3.4 (App Router), React 19.2.8, TypeScript, Tailwind v4.
- Content: Sanity CMS (`sanity` v5, `next-sanity` v13), studio mounted at
  `/studio` in-app.
- Email: Resend (outbound + one inbound webhook).
- Payments: Stripe SDK is installed and one checkout route exists, but see
  below — it's disconnected from the site.
- Analytics: Vercel Analytics + Speed Insights (both wired into
  `app/layout.tsx`).
- No auth library, no session handling, no middleware.ts, nothing that
  authenticates a user anywhere in the app.

### Deploy

No `vercel.json`, no CI config, no Dockerfile. Deploy is Vercel's
zero-config Next.js detection off the `main`/feature branch — standard for
`create-next-app` projects, consistent with the Vercel Analytics packages
and the `AGENTS.md` block that `next dev` itself writes (confirms local dev
against a recent canary/major Next.js). No `.env` file is committed (good)
and no `.env.example` exists either (gap — see open questions).

### "Database"

There is no relational database. The only persistence is Sanity, a
headless content lake (schemaless documents, not tables/rows in the SQL
sense). Document types defined: `product`, `post`, `author`, `category`,
`testimonial`, `faq`, `page`, `contactMessage`, `waitlist`, `legal`,
`changelog`. Of these:

- `contactMessage` and `waitlist` are genuinely written to at runtime (from
  `/api/contact` and `/api/waitlist`), wrapped in try/catch so a Sanity
  failure never blocks the email send — writes are best-effort, not
  guaranteed.
- `post`, `faq`, `testimonial`, `changelog` are read by live pages
  (`/blog`, `/changelog`, homepage FAQ) via GROQ queries with sane empty
  states ("No updates published yet"). This part is real, working
  CMS-driven content — I can't tell you whether it's populated with real
  content because that requires a project token I don't have.
- `product` is defined in the schema, has a Studio entry, and is **never
  queried anywhere in application code.** The product catalog shown on the
  site (`/products`, `/products/[slug]`) comes entirely from a hardcoded
  array in `data/products.ts`. The Sanity `product` type is dead schema.
- There is no `order`, `purchase`, `customer`, or `subscription` document
  type anywhere. Nothing in this codebase records that a transaction
  happened.

### Auth

Does not exist. No login, no session, no middleware, no protected route
anywhere in the Next.js app. `/studio` (Sanity Studio) has no
application-level gate of its own — access control there is entirely
Sanity's own project auth, external to this codebase.

### Billing / is anything charging real money

This needs to be precise because the honest answer has two parts:

1. **Reachable from the live site: no.** `/api/checkout` (the Stripe
   route) exists and is fully wired — it creates a real Stripe Checkout
   Session with `mode: 'payment'`. But the only component that calls it,
   `components/CheckoutButton.tsx`, is imported by **nothing**. I checked.
   The product detail page was switched over to a waitlist-only flow in an
   earlier commit ("Switch product detail page entirely to Waitlist and
   Lead Generation mode") and the checkout button was never removed, just
   orphaned. A visitor cannot currently pay through this site.
2. **Reachable directly: yes, if the deployed `STRIPE_SECRET_KEY` is a
   live key.** The route has no auth, no rate limit, and no validation
   beyond "price and name present." A raw `POST /api/checkout` with an
   attacker-chosen price would create a real, payable Stripe session. I
   cannot tell from the code whether the configured key is live or test —
   that's a fact about the Vercel environment, not the repo, and it's the
   first thing worth checking.

Even setting aside reachability: **there is no webhook handler for
`checkout.session.completed`.** If a charge ever did complete, nothing in
this codebase would know. No order is written anywhere, no license is
issued, no fulfillment triggers. `/success` is a static "thank you" page
that doesn't even read the `session_id` query param it's given. If this
ever gets reconnected, the entire back half — record the sale, fulfill it,
reconcile it — doesn't exist. Right now the correct description is "a
Stripe integration was started and abandoned mid-build," not "billing
exists."

### What's shipping vs. scaffolded vs. dead

**Shipping and working:**
- Marketing pages (home, about, products index, individual product pages
  as description-only pages).
- Waitlist capture (`/api/waitlist`) — writes to Sanity, emails the
  signup a confirmation, emails support a notification.
- Contact form (`/api/contact`) — same pattern, plus an inbound-email
  webhook that files replies back into `contactMessage`.
- Blog, changelog, FAQ — real Sanity-backed content with correct empty
  states.

**Scaffolded / disconnected:**
- Stripe checkout — code complete, orphaned from the UI, no completion
  webhook, no order record. Not "off," just never finished.
- Sanity `product` schema — defined, has a Studio UI, never read.

**Dead code (safe to delete, found during this read, not touched):**
- `components/ProductWaitlistForm.tsx` — byte-identical duplicate of
  `app/products/[slug]/ProductWaitlistForm.tsx`, unused.
- `components/WaitlistForm.tsx` — unused, superseded by
  `NewsletterWaitlist.tsx` and the product-specific form.
- `components/CheckoutButton.tsx` — unused (see above).

### Broken / risky, specifically

- `/api/checkout` is an unauthenticated endpoint that can mint real Stripe
  charges at an attacker-supplied price, with no server-side price
  validation against a trusted source (price comes straight from the
  request body). Low real-world risk only because it's currently
  unreachable from the UI — but it's live on the deployed domain right
  now if you know the route.
- No `.env.example` — anyone picking this repo up has to reverse-engineer
  required environment variables from route handlers (`STRIPE_SECRET_KEY`,
  `RESEND_API_KEY`, `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_
  DATASET`, `SANITY_API_TOKEN`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`).
- No tests, no CI, at any point in the repo.
- Sanity write failures are silently swallowed (`console.warn` and
  continue) in all three API routes. A waitlist signup can "succeed" (the
  visitor gets a 200 and a confirmation email) while the Sanity write
  failed and no record of the lead exists anywhere. For a lead-gen site
  that's the whole point of the site failing quietly.
- Commit history includes real secrets-adjacent language in messages (e.g.
  "resend api key") — worth a quick look at whether any key was ever
  committed and later removed rather than just referenced in a message;
  I didn't find a committed secret in the current tree or in the diffs I
  read, but I did not run a full history-wide secret scan.

**Maturity, bluntly:** this is a solo-built marketing/lead-gen site for a
company that doesn't have shipping products yet. It's reasonably
well-built for what it is — the CMS wiring, empty states, and email flows
are done properly. It is not infrastructure nexa-ai should treat as a
business with customers, revenue, or data worth protecting yet. It's a
funnel with three roads (waitlist, contact, and a dead checkout button).

---

## 2. What nexa-ai is, today

One file: `readme.md`. One commit. No code, no package manifest, no
directory structure, no dependencies chosen. The readme is not
documentation of an existing system — it's a set of invariants for a
system that doesn't exist yet. I'm treating it as the spec constraint for
everything below, not as prior art to preserve.

---

## 3. Proposal

### 3a. Data model

Postgres, relational, `business_id` on every table starting with the first
migration, per invariant #4. No Nexa Labs-specific values baked into any
schema — the agent roster, KPIs, and adapter config are rows, not columns
or enums.

```
businesses
  id              uuid pk
  slug            text unique        -- 'nexa-labs', stable, human-chosen
  name            text
  status          text               -- 'active' | 'paused' | 'archived'
  config          jsonb              -- business-specific knobs (currency, timezone, ...)
  created_at      timestamptz

owners
  id              uuid pk
  email           text unique
  password_hash   text               -- or a passkey/magic-link credential table instead; see 3b note
  created_at      timestamptz
  -- single-tenant today (one owner), but this is its own table rather than
  -- an env-var-configured single admin so the dashboard's auth model
  -- doesn't have to change shape the day a second person needs access.

agents
  id              uuid pk
  business_id     uuid fk -> businesses
  key             text               -- 'waitlist-triage', stable identifier, not a display name
  role            text               -- free-text description of scope
  autonomy_level  int default 1      -- see 3b
  config          jsonb              -- agent-specific parameters, versioned prompt ref, model route key
  active          bool default true
  created_at      timestamptz

tasks
  id              uuid pk
  business_id     uuid fk -> businesses
  agent_id        uuid fk -> agents
  type            text
  status          text               -- 'queued' | 'running' | 'done' | 'failed'
  input           jsonb
  output          jsonb
  created_at      timestamptz
  completed_at    timestamptz nullable

events
  id              uuid pk
  business_id     uuid fk -> businesses
  source          text               -- adapter id, e.g. 'nexalabs-web', 'tiktok-channel'
  type            text               -- 'waitlist_signup', 'contact_message', 'video_posted', ...
  payload         jsonb
  occurred_at     timestamptz        -- when it happened in the source system
  ingested_at     timestamptz        -- when nexa-ai learned about it (poll vs. backfill vs. webhook differ here)
  ingestion_mode  text               -- 'backfill' | 'poll' | 'webhook' — see 3c; keeps the one-time
                                      -- historical load auditable and distinct from live ingestion

decisions
  id                  uuid pk
  business_id         uuid fk -> businesses
  agent_id            uuid fk -> agents
  task_id             uuid fk -> tasks nullable
  action_type         text
  reasoning           text
  expected_result     jsonb
  actual_result       jsonb nullable   -- filled in after the fact; this is the learning loop
  confidence          numeric nullable
  created_at          timestamptz
  resolved_at         timestamptz nullable

approvals
  id                      uuid pk
  business_id             uuid fk -> businesses
  decision_id             uuid fk -> decisions
  status                  text        -- 'pending' | 'approved' | 'denied' | 'expired'
  expected_cost           jsonb
  expected_benefit        text
  risk                    text
  alternatives            jsonb       -- array, at least one entry required at creation
  recommendation          text
  confidence              numeric
  consequence_of_inaction text
  requested_at            timestamptz
  resolved_at             timestamptz nullable
  resolved_by             uuid fk -> owners nullable  -- an owner, never an agent

transactions
  id              uuid pk
  business_id     uuid fk -> businesses
  decision_id     uuid fk -> decisions nullable
  type            text               -- 'charge' | 'refund' | 'payout' | ...
  amount_cents    bigint
  currency        text
  external_ref    text               -- e.g. Stripe payment_intent id
  status          text
  created_at      timestamptz

audit_log
  id                  uuid pk
  business_id         uuid fk -> businesses
  agent_id            uuid fk -> agents nullable
  action_type         text
  permission_level     int
  payload             jsonb
  expected_result     jsonb
  actual_result       jsonb nullable
  status              text            -- 'requested' | 'approved' | 'denied' | 'executed' | 'failed'
  requested_at        timestamptz
  executed_at         timestamptz nullable
```

`audit_log` is deliberately not normalized against `decisions` /
`approvals` by foreign key alone — it's written to directly by the
permission engine at request time, before an approval or execution
exists, so the "audit before execute" invariant holds even if the
approval or decision row write fails. It's append-only: no `UPDATE`
statement should ever be issued against it in application code except to
fill in `actual_result` / `executed_at` once, from the permission engine
only.

### 3b. The permission engine

Every agent action goes through exactly one function:

```ts
async function requestAction(request: ActionRequest): Promise<ActionOutcome>

type ActionRequest = {
  businessId: string
  agentId: string
  actionType: string          // matches an executor registered for this business's adapters
  payload: JsonValue          // plain data only — see below
  reasoning: string
  expectedResult: JsonValue
  expectedCost?: { amountCents: number; currency: string }
}

type ActionOutcome =
  | { status: 'executed'; auditId: string; result: JsonValue }
  | { status: 'denied'; auditId: string; reason: string }
  | { status: 'pending_approval'; auditId: string; approvalId: string }
```

`JsonValue` is a recursive type of primitives, arrays, and plain objects
only — no functions, no class instances, no client handles. That
restriction is load-bearing, not cosmetic (see below).

**Why an agent cannot bypass this, structurally:**

The wrong answer — and the readme is right to pre-empt it — is "agents are
told to call `requestAction` and told not to import a database client
directly." That's a policy, and policies get violated by accident or by a
future contributor who didn't read the readme. The actual design has to
make the bypass unavailable, not merely discouraged. Four things, stacked,
each closing a different door:

1. **Agents never hold credentials, so there's nothing to bypass with.**
   The process that runs agent code never has `DATABASE_URL`,
   `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, or any adapter credential in its
   environment. Those are loaded exactly once, inside the permission
   engine's own process, and never re-exported. An agent that imported a
   Postgres client would get a client with no connection string — it has
   the tool but not the key.

2. **`ActionRequest` is data, not capability.** Because the payload type
   is restricted to plain JSON, an agent cannot hand the permission engine
   a live database connection, an HTTP client, or a callback to execute
   even if one somehow existed in scope. It can only describe what it
   wants done. The thing that turns a description into a side effect — the
   executor for `actionType` — lives inside the permission engine package
   and is never part of that package's public `exports` map. Nothing
   outside `packages/permission-engine/executors/**` can `import` an
   executor, because there is no path to import it from — Node's
   `package.json#exports` field enforces this at module-resolution time,
   not by convention.

3. **A CI check makes the boundary self-enforcing.** A dependency-graph
   lint (dependency-cruiser or an ESLint `no-restricted-imports` rule
   scoped by path) runs in CI and fails the build if any file outside
   `packages/permission-engine/**` imports the DB client package, any
   adapter's HTTP client, or a credentials-loading module. This is the
   test the current readme already promises exists — it needs to exist
   before agent code does, not after, which is why it's first in the
   build order below.

4. **Network egress is denied at the infra layer for anything that isn't
   the permission engine.** Whatever runs agent code (a worker process, a
   sandboxed container, a queue consumer — undecided, see open questions)
   has no outbound network access except to the permission engine's own
   internal endpoint. Even a successful attempt to smuggle a credential
   into agent-process memory, or a dependency-confusion attack that
   sneaks a network call into a transitive dependency of agent code, hits
   a firewall with nowhere to go. This is the layer that survives code
   review mistakes: 1–3 are application-level and can, in principle, be
   gotten wrong by a future PR; 4 does not depend on the application code
   being correct.

Self-modification lockout (invariant #3) uses the same mechanism, not a
separate one: `permission_engine`, `audit_log`, `approvals`, and owner
config are covered by the same CI import-boundary check, and at the
database level the role connection string handed to any general-purpose
"Nexa AI can edit its own code" capability (if one is ever built — it
isn't yet, see 3d) has no `GRANT` on those tables at all. Two independent
layers have to both fail for a bypass to work: the import boundary and
the DB role's own privileges.

### 3c. The adapter interface

Designed against the harder future case, not the easy current one: a
business that is only an API and a spreadsheet (the stated TikTok example,
used as a design target — no second business is actually planned yet) has
no concept of "server," "webhook," or "database" of its own. The interface
has to be satisfiable by polling an API and reading a spreadsheet, not just
by a codebase nexa-ai can hook into.

You confirmed nexa-ai needs to react faster than a poll interval for at
least some events, so pull-only isn't sufficient — the interface needs a
push path too, kept optional because not every adapter (a spreadsheet,
certainly not TikTok) can offer one:

```ts
interface BusinessAdapter {
  readonly adapterType: string          // 'nexalabs-web', 'tiktok-channel', ...

  backfill(): Promise<ObservedEvent[]>
    // One-time historical load, run once when the adapter is first
    // registered for a business. Separate from observe() so a slow full
    // history pull doesn't block or get conflated with live polling —
    // events land with ingestion_mode: 'backfill'.

  observe(since: Timestamp): Promise<ObservedEvent[]>
    // Pull, on an interval. The lowest common denominator across "has
    // webhooks," "has an API with no webhooks," and "is a spreadsheet
    // someone edits by hand" — every adapter must implement this even if
    // it also pushes, so polling remains the fallback of last resort.

  registerWebhook?(callbackUrl: string): Promise<{ webhookId: string }>
    // Optional. Where the source system supports it (Resend, Stripe,
    // most modern APIs), the adapter registers a push subscription
    // instead of relying on poll latency. The permission engine owns one
    // HTTP receiver per adapter type; the adapter's job is only to
    // verify the incoming payload's signature and translate it into
    // ObservedEvent shape — it never gets direct write access to
    // `events`, same as every other path here. Events land with
    // ingestion_mode: 'webhook'.

  listActions(): ActionDefinition[]
    // Declares what this adapter can execute and the JSON schema each
    // action's payload must satisfy. The permission engine validates
    // against this before anything runs; agents discover capabilities
    // by reading this list, never by knowing adapter internals.

  execute(actionType: string, payload: JsonValue): Promise<ActionResult>
    // Called only by a permission-engine executor, never directly.
    // Credentials are injected into the adapter instance at construction
    // time, inside the permission engine process; the adapter instance
    // itself is never handed to agent code.

  healthCheck(): Promise<{ ok: boolean; detail?: string }>
}
```

Credentials are resolved from a `business_credentials` table and injected
when the executor constructs the adapter — inside the permission engine's
process boundary, per 3b. An adapter never reads `process.env` for its own
secrets; it receives them.

**On the "encryption at rest" question you weren't sure about** — plainly:
`business_credentials` stores things like the Stripe secret key and Sanity
API token. If the database were ever read by someone who shouldn't (a
backup leak, a misconfigured access grant), plain-text credentials in that
table would hand over everything at once. The fix isn't exotic: the column
is stored encrypted, and the one key needed to decrypt it lives outside
the database entirely — as an environment variable on whatever host runs
the permission engine, never in a row, never in a log line. Concretely,
for a single-owner system this size: one `CREDENTIALS_ENCRYPTION_KEY`
environment variable, used to encrypt/decrypt that one column with a
standard library primitive (e.g. AES-GCM) before it ever touches disk.
That's it — no external secrets-manager service is needed at this scale.
It only becomes worth a dedicated service (Vercel's encrypted env vars
already do something similar for the app's *own* secrets, but this is
about *business* credentials the app stores in its own database) once
there are enough businesses/adapters that manual key rotation gets
painful. One key, one env var, one encrypt/decrypt helper — nothing to
build in advance of needing it.

For nexalabs specifically, one `NexaLabsAdapter` wraps the Sanity read
client (content + waitlist/contact documents), the Stripe API in read-only
mode (list charges/sessions, never create them until there's an approved
`actionType` for it — and note the live Stripe key is in **test mode**,
confirmed, because there's no KVK yet; that's a real constraint on the
business, not just the code, so nothing here should assume live charges
are even legally possible yet), and Resend (read delivery/inbound events).
It does not import anything from the `Nexa-labs` repo — it talks to the
same external services that repo talks to, with its own credentials,
which is what keeps the two repos genuinely decoupled rather than
decoupled in name only. `registerWebhook` is realistic here first: Resend
and Stripe both support webhooks, so nexalabs is also the adapter that
proves out the push path, not just the pull path. A TikTok adapter would
wrap the TikTok API for `observe` and
a Google Sheets API client for whatever isn't available through the API,
behind the identical interface — no changes to the permission engine, the
data model, or any core code. That's the test of whether this interface
is right: business #2 is a config row (a new `businesses` record, a new
`business_credentials` row, a new adapter registration) plus one new
adapter implementation file. Nothing in `packages/permission-engine`
changes.

### 3d. Build order

1. **Permission engine core + audit log + the import-boundary CI test +
   tests for the engine itself.** Nothing else starts until this exists
   and is tested, per the readme's own stated convention. No executors
   registered yet — it can approve/deny/queue against a no-op executor.
2. **Migrations for `businesses`, `agents`, `audit_log`, `approvals`,
   `decisions`.** Seed exactly one business row (`nexa-labs`) and zero
   agent rows — agents get seeded via config, not hardcoded, per
   invariant #5.
3. **Approval flow, end to end, as a dashboard with owner login.**
   Confirmed: a dashboard, not Slack/email/CLI, and it needs its own
   auth (the `owners` table above — email + password or a magic link is
   enough for one owner; no need for anything heavier at this scale).
   This has to exist before any agent does anything, because default
   autonomy is level 1 and level 1 means every action stops here.
4. **`NexaLabsAdapter`: backfill, then observe, then webhooks.** Run
   `backfill()` once against existing Sanity `waitlist` and
   `contactMessage` documents (confirmed: backfill, don't start empty) so
   `events` reflects everything that happened before nexa-ai existed,
   then move to `observe()` polling, then add `registerWebhook` for
   Resend/Stripe once the poll path is proven — confirmed nexa-ai needs
   to react faster than a poll interval for at least some events, so
   webhook registration isn't a someday nice-to-have, it belongs in this
   step, not deferred. No `execute` capability registered yet. This is
   the first integration because it's the lowest-risk one available —
   nexalabs has no real money flow today (Stripe is in test mode, and
   checkout is disconnected from the UI besides) and no customer data
   beyond leads, so mistakes here are cheap.
5. **One agent, read-only.** Something like a waitlist/contact triage
   agent that observes events and produces decisions + approval requests
   for a human to read (e.g., "draft this reply," "flag this lead as
   high-intent") — no `actionType` it can execute exists yet, so its
   worst-case failure mode is a bad draft, not a bad action.
6. **First real `execute` capability**, narrowly scoped (e.g., "send this
   drafted email via Resend" as a single, specific action type) — still
   gated at level 1, still requiring the approval flow from step 3.
7. **`transactions` table wired to the adapter's read-only Stripe view**,
   so if the nexalabs checkout ever gets reconnected there's already
   somewhere for the record to land. This is deliberately about
   observability of money, not about giving nexa-ai the ability to charge
   anyone.

**Deliberately not building yet, and why:**

- **Any autonomy level above 1.** The readme is explicit that this is an
  owner decision made in config, not a code default, and there's no
  track record yet to justify promoting anything.
- **A second adapter / second business.** The interface in 3c is designed
  to make this cheap later; building it now would be validating the
  interface against zero real second cases, which is how you get an
  abstraction that's wrong in a way nothing catches.
- **A write path to Stripe.** nexalabs's own checkout isn't even
  connected to its UI right now. Giving nexa-ai the ability to create
  charges before the business itself has a working, audited checkout
  flow is solving a problem that doesn't exist yet and skipping past one
  that does.
- **Self-modification of anything, including agent prompts via a UI.**
  Prompts are versioned files per the readme's own convention; an editing
  UI is a separate, later decision, and it must never touch the
  permission engine, limits, or audit log regardless of how it's built.
- **Model routing abstraction.** The readme wants model choice made in
  one place — that's easy to satisfy with a single function once there's
  more than one call site. Building a routing layer before there's a
  second agent to route differently is premature.

---

## 4. Resolved questions, remaining guesses, and what's still genuinely open

**Resolved, and folded into the design above:**

1. **Stripe is in test mode**, deliberately — there's no KVK yet, so live
   charges aren't legally possible right now regardless of what the code
   does. This also surfaced a real process detail worth designing for
   later, not now: pricing isn't self-serve — you want to email a client
   and negotiate price before anything is charged. That's a reason the
   orphaned checkout button shouldn't just get reconnected as-is later;
   a "negotiate then invoice" flow is a different shape than "click to
   pay the listed price," and probably wants an agent-drafted-email step
   ahead of any checkout link, gated through the approval flow like
   everything else. Noted for a future plan, not this one.
2. **Approval surface: a dashboard.** Folded into build order step 3.
3. **The dashboard needs its own login.** Added an `owners` table to the
   data model (3a) — single row today, but its own table so the auth
   model doesn't change shape the day a second person needs access.
   Email + password or a magic link is enough; nothing heavier is
   justified for one owner.
4. **Backfill confirmed.** `BusinessAdapter` now has a separate
   `backfill()` method (3c), run once when an adapter is registered, so
   existing nexalabs waitlist/contact history lands in `events` with
   `ingestion_mode: 'backfill'` rather than nexa-ai starting blind.
5. **TikTok is a design target, not a real plan.** No schedule change —
   the interface is built to survive that case, but adapter #2 isn't
   prioritized ahead of getting adapter #1 and the permission engine
   right.
6. **Encryption, explained and resolved for now:** one encryption key,
   held as an environment variable outside the database, used to
   encrypt/decrypt the `business_credentials` columns before they touch
   disk. No external secrets-manager service needed yet — see the full
   explanation inline in 3c.
7. **Reactivity: confirmed, faster than polling is needed.** Added
   `registerWebhook` to `BusinessAdapter` (3c) as a first-class, not
   optional-someday, path — nexalabs (via Resend/Stripe webhooks) is now
   also the adapter that proves out push, not just pull.

**Still open, now that Vercel is connected:**

You've now given access to the Vercel account hosting nexalabs.tech,
which changes my earlier guess about where nexa-ai runs. It's worth
naming as a real option rather than leaving it a total blank: Vercel
Cron (scheduled function invocations) covers the `observe()` polling
loop, and Vercel serverless/edge functions can receive the
`registerWebhook` callbacks — meaning nexa-ai might not need a separate
always-on host at all, and could live on the same platform you're
already paying for and already know. That's a real proposal, not a
decision — it trades away a genuinely long-running worker process (the
simpler mental model for something that "runs agents") for serverless
functions with cold starts and execution-time limits, and I don't know
if that tradeoff is one you want made for you. Worth an explicit yes/no
before it's load-bearing in the next plan doc, along with the database
that goes with it (Vercel Postgres / Neon, if this is the direction).

**Still unresolved, not addressed by anything above:**

- **Language/runtime for nexa-ai: still an assumption (TypeScript/Node),
  not a confirmed decision.** Everything about the import-boundary
  enforcement in 3b (`package.json#exports`) is Node/TS-specific; a
  different runtime keeps the same design but changes that mechanism.
- **Agents are LLM-backed:** inferred from "model choice is a routing
  decision" and "agent prompts are versioned files" in the readme, never
  actually confirmed, and no provider named.

The "orphaned Stripe checkout with no completion webhook" situation in
nexalabs remains a pre-existing gap in that repo, not something nexa-ai's
design needs to route around — and now that price negotiation happens by
email first (point 1 above), it's likely that gap gets redesigned rather
than just reconnected whenever checkout comes back. That's a call for
whenever that work actually starts, not this document.
