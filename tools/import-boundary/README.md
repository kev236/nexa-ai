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
the one path prefix allowed to import them
(`packages/permission-engine/src/executors/`). None of those packages are
installed yet — no adapters exist — so the list today is forward-looking:
it exists so that the first `npm install stripe` anywhere outside
`executors/` fails the build immediately, rather than the boundary being
retrofitted after the fact.

Run it directly with `npm run check:boundaries`, or see it exercised
against both synthetic fixtures and the real `packages/` tree in
`test/import-boundary.test.ts` at the repo root.
