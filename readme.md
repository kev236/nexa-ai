# Nexa AI

Internal operations system for Nexa Labs Core. It observes and partly operates
small businesses. Today there is exactly one: Nexa Labs (nexalabs.tech).

It is not a chatbot, not a product, and not part of any business it operates.

## The `nexalabs` repo

Separate repo, separate lifecycle. Nexa AI reaches it through an adapter with
its own credentials, the same way it will reach a TikTok channel or a Shopify
store later. Never import from it. Never share a package with it. If a change
to Nexa Labs requires a change in this repo's core, the abstraction is wrong.

## Invariants

These are not preferences. Breaking one is a bug regardless of what else the
change accomplishes.

1. **One chokepoint.** Every agent action passes through the permission engine.
   No module outside the approved execution path may import a database client,
   an HTTP client, or anything holding credentials. There is a test that fails
   the build on violation — do not weaken or skip it.
2. **Audit before execute.** Anything that spends money, contacts a customer,
   or changes something publicly visible writes to `audit_log` *before* it runs,
   including the agent, business, reason, permission level, and expected result.
   Then writes the outcome after.
3. **No self-modification of limits.** The permission engine, spending caps,
   audit log, owner permissions, and this file are outside the system's own
   reach. If you find or build a path that lets Nexa AI edit them, stop and
   flag it.
4. **`business_id` everywhere.** Every table, every query, every agent
   instantiation. There will be one business row for a long time. Write it as
   though there are forty.
5. **No business specifics in core.** Agent rosters, KPIs, workflows,
   thresholds, and integrations are data, not code. If "Nexa Labs" appears
   anywhere outside a seed file or a config row, that's the bug.
6. **Secrets live in the environment.** Never in the repo, never in the
   database unencrypted, never in a log line, never in an error message.
7. **Default autonomy is level 1.** Agents act only after explicit approval.
   Promoting a single narrow action type to a higher level is an owner decision
   made in config, never a code default.

## Approvals

An agent that hits a limit stops and creates an approval request. It does not
retry, split the action into smaller pieces to stay under the cap, find an
alternative route, or proceed with a cheaper version. It stops and waits.

Every approval request carries: business, agent, the decision, why it is being
asked, expected cost, expected benefit, risk, at least one alternative, the
recommendation, a confidence score, and what happens if nothing is done.

## Conventions

- Tests for the permission engine before features that depend on it.
- Every autonomous decision records expected result and actual result, so the
  gap between them is queryable later. This is the learning system; it does not
  work retroactively.
- Migrations are forward-only and reviewed. Never edit one that has run.
- Agent prompts are versioned files, not string literals in application code.
- Model choice is a routing decision made in one place, never hardcoded at a
  call site.

## When unsure

Say so and stop. A wrong guess in this system spends real money, emails real
customers, or changes a live site. Asking costs a message. The alternative
costs a refund, a chargeback, or a customer.

## Development

```
npm install
cp .env.example .env   # fill in DATABASE_URL against a local Postgres
npm run db:migrate
npm run db:seed
npm run typecheck
npm run check:boundaries
npm test
```

See `docs/plan-001-foundations.md` for the design this is built from, and
`packages/permission-engine/README.md` for what exists today versus what's
deliberately deferred.