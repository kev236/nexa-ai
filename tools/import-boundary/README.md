# Import boundary check

The CI-failing test the project readme promises: "no module outside the
approved execution path may import a database client, an HTTP client, or
anything holding credentials." This is the second of four layers behind
that invariant (see `docs/plan-001-foundations.md` section 3b) — a static
scan, independent of the `package.json#exports` restriction on
`@nexa-ai/permission-engine`, so a relative reach-around
(`../../permission-engine/src/executors/registry.js`) gets caught too.

`boundary.config.json` lists credential-holding module specifiers
(`pg`, `stripe`, `resend`, `@sanity/client`, raw `http`/`https`, ...) and
the one path prefix allowed to import them: all of
`packages/permission-engine/src/` — the whole package, not just its
`executors/` subfolder. That's deliberate: the invariant is "no module
outside the approved execution path," and the approved execution path is
the permission engine package as a whole, including its own audit-log and
approval persistence (which legitimately need `pg`) — not only the
executors that call out to Stripe/Resend/Sanity on a business's behalf.
A future `packages/agents/` or `packages/dashboard/` gets none of this
allowance; they call `requestAction`/`resolveApproval` like anything else
outside this package.

Run it directly with `npm run check:boundaries`, or see it exercised
against both synthetic fixtures and the real `packages/` tree in
`test/import-boundary.test.ts` at the repo root.
