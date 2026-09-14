# @nexa-ai/permission-engine

The one chokepoint every agent action passes through. See
`docs/plan-001-foundations.md` section 3b at the repo root for the full
design rationale — this file only covers what's specific to reading the
code.

## Why `exports` only lists `.`

`package.json#exports` maps `.` to `./src/index.ts` and nothing else.
`src/executors/**` is deliberately absent from that map. Node's package
resolution refuses a deep import into an unlisted subpath from any other
workspace package — so `import { registerExecutor } from
'@nexa-ai/permission-engine/executors/registry'` fails to resolve from
outside this package, not because of a lint rule, but because there is no
route to it. That's one of four independent layers behind the "no module
outside the approved execution path may import a credential-holding
client" invariant; `tools/import-boundary/` (repo root) is the second
layer, catching violations that don't even try to go through package
resolution (e.g. a relative `../../permission-engine/src/executors/...`
reach-around). See the plan doc for the other two (no credentials in the
agent process; network egress denial).

Code inside this package (including its own tests) can still import
`src/executors/**` by relative path — that's expected. The boundary is
about code *outside* this package, not within it.

## What's here vs. what isn't yet

- `requestAction` / `resolveApproval`: implemented, tested, exported.
- Executors: only a `noop` executor is registered, for testing the
  approve → execute path shape. Real executors (Stripe, Resend, Sanity)
  arrive with the adapters in a later plan, once there's something for
  them to call.
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
