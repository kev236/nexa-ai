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
your only line of defense."
