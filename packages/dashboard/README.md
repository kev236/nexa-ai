# @nexa-ai/dashboard

The owner approval surface — build order step 3. Everything it does goes
through `@nexa-ai/permission-engine`'s public exports
(`src/lib/engine.ts`); it never imports `pg` or talks to Postgres
directly, same as any other package outside the permission engine (see
`tools/import-boundary/README.md` at the repo root — this package is
scanned like any other).

## Setup

`@nexa-ai/permission-engine`'s `package.json#exports` points at its built
`dist/`, not raw source (Turbopack couldn't resolve the `.js`-suffixed
relative imports NodeNext requires in the unbuilt TS — see that
package's own history for why). This package's own `dev` / `build`
scripts build that dependency first (`npm run build -w
@nexa-ai/permission-engine && next dev|build`) — deliberately not a
`predev`/`prebuild` hook, because npm doesn't run those when a script is
invoked with cwd inside a workspace member (confirmed by hand: silently
skipped). That self-sufficiency is what makes Vercel's build work once
its Root Directory is set to this package — Vercel runs this directory's
own `build` script, not the repo root's.

`npm run dashboard:dev` / `dashboard:build` (repo root) just delegate
here (`npm run dev|build --workspace=packages/dashboard`).

Next.js loads `.env` from this package's own directory, not the repo
root, but every secret this app needs (`DATABASE_URL`, `SESSION_SECRET`)
lives in the one root `.env` per the repo's `.env.example`. Symlink
rather than duplicate:

```
cd packages/dashboard
ln -s ../../.env .env
```

(Already covered by the repo's `.gitignore` — `.env` is ignored
everywhere, not just at the root.)

## Auth

Single owner, password-based, following the Next.js auth guide's
recommended pattern (Data Access Layer + `jose`-signed session cookie).
There is no self-service signup — create the one owner account with:

```
npm run db:create-owner -- <email> <password>   # from the repo root
```

`src/proxy.ts` does an optimistic redirect-if-no-cookie check (Next 16
renamed `middleware.ts` to `proxy.ts` — functionality is unchanged).
`src/lib/dal.ts`'s `verifySession()` is the real check, called from every
page and Server Action, per the guide's warning that Proxy "should not be
your only line of defense." Its matcher excludes `api/cron` — that route
authenticates with `CRON_SECRET`, never a session cookie (Vercel Cron
isn't a browser), so this session gate would otherwise redirect every
cron request to `/login` before the route's own auth ran; caught by
actually running the route locally, not by inspection.

## Pages (step 8)

Three, behind the shared `Nav` (`src/components/Nav.tsx`):

- **Approvals** (`/`) — unchanged from step 3: the pending-approval
  queue, approve/deny.
- **Activity** (`/activity`) — an agent status strip (key, role,
  autonomy level, active/inactive, and its most recent action + status,
  derived from `AuditLogStore.listByBusiness()` — no new columns
  needed), a recently-observed events list, and the full audit log as a
  real feed. This is the "what is every agent doing" view.
- **Money** (`/transactions`) — the `transactions` table (step 7),
  which had no UI at all before this. Observability only, same as the
  table itself.

`src/lib/business.ts` is the one place that resolves "the" business by
slug — the dashboard is honestly single-tenant today (no business
picker anywhere in it, the same gap `listPendingApprovals()` already
had by returning every business's approvals unscoped). Every page goes
through this one function rather than repeating the slug.

## Scheduled polling (step 8)

`src/app/api/cron/poll/route.ts`, scheduled by `vercel.json`. Polls
nexalabs (Sanity events, Stripe/crypto transactions if configured),
then runs the waitlist-triage agent over anything new —
`runWaitlistTriageOnce()`, the exact same function
`db/runWaitlistTriage.mjs` calls, so the manual and scheduled paths
can't drift apart. Bounded per `readme.md`'s "Agents" section
(`maxActions`/`timeoutMs`, defaults 20 / 60s) — a run that hits either
limit stops and reports rather than pushing through; the next scheduled
run picks up the rest, since un-triaged events are exactly what it
looks for again.

Authenticated with `CRON_SECRET` (`Authorization: Bearer <value>`),
matching Vercel's own documented pattern — also usable for `vercel
crons run /api/cron/poll` or a manual authenticated request. Scheduled
once daily (`0 9 * * *`) — the team's Vercel plan is Hobby, which caps
cron frequency at once/day; a finer interval needs Pro.

Fails closed (`readme.md`'s invariant #8): a missing business/agent
row, a broken adapter, or any other real error returns 500 with a
specific message, never a silent 200 having done less than it should.
The one deliberate exception is `ingestTransactions()` throwing "no
payment source configured" — Stripe and the crypto wallet are both
optional, so that's an expected state, reported as skipped rather than
failing the run.

**Every store this app's engine singleton (`src/lib/engine.ts`) uses
must be the Postgres-backed one.** A Vercel serverless function gets a
fresh process per invocation (or close to it) — an in-memory store
(`createPermissionEngine()`'s default when a dep is omitted) would
silently lose everything between cron runs. This bit once already: step
6/7 only wired up `auditStore`/`approvalStore`/`ownerStore`, leaving
`eventStore`/`decisionStore`/`transactionStore`/`businessStore`/
`agentStore` on their in-memory defaults without anyone noticing, since
the approvals page never exercised them. Caught by running the cron
route locally against real Postgres, not by inspection — worth
remembering next time a new store type is added anywhere in
`packages/permission-engine`.
