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
your only line of defense." Its matcher excludes `api/cron` and
`api/webhooks` — those routes authenticate with `CRON_SECRET` or a
payload signature, never a session cookie (neither Vercel Cron nor
Sanity is a browser), so this session gate would otherwise redirect
every such request to `/login` before the route's own auth ran; caught
by actually running the routes locally, not by inspection.

## Pages (step 8, +1 in step 15, +1 in step 16, +1 in step 19, +1 in step 20, +1 in step 23)

Eight, behind the shared `Nav` (`src/components/Nav.tsx`), plus a HUD
overview at the top of Approvals (see "The demo page merged into
Approvals" below for what that overview actually is now):

- **Approvals** (`/`) — the pending-approval queue, approve/deny. Since
  the bento-grid overview, also opens with an at-a-glance summary
  (pending count, active agents, latest activity, money, top
  opportunity, campaigns) above the queue itself.
- **Activity** (`/activity`) — an agent status strip (key, role,
  active/inactive, and its most recent action + status, derived from
  `AuditLogStore.listByBusiness()` — no new columns needed), a
  recently-observed events list, and the full audit log as a real feed.
  This is the "what is every agent doing" view. Each executed entry is
  also labeled "approved by owner" or "auto-approved by policy"
  (`ApprovalStore.listByBusiness()`, joined by `auditId`) — since step
  18, that's most entries, not the exception, so this label is what
  keeps auto-approval visible rather than silently invisible.
- **Money** (`/transactions`) — the `transactions` table (step 7),
  which had no UI at all before this. Observability only, same as the
  table itself.
- **Opportunities** (`/opportunities`, `/opportunities/new`,
  `/opportunities/[id]/edit`, step 15; `+ /opportunities` gained a
  "Discover opportunities" button in step 17) — the 12-dimension
  opportunity-scoring format from the owner's own vision doc: create,
  edit, archive/reopen by hand, sorted highest score first, same as
  step 15. Step 17 added a second source — the Opportunity Discovery
  Agent proposes up to 3 new scored opportunities per run
  (`discoverOpportunities()` in `app/opportunities/actions.ts`, calling
  `runOpportunityDiscoveryOnce()`), badged "discovered" wherever
  `proposedByAgentId` is set, to distinguish an agent's proposal from
  the owner's own notes at a glance. `OpportunityForm.tsx` (`'use
  client'`, shared by the new/edit pages) deliberately does not import
  `SCORE_DIMENSIONS` from `@nexa-ai/permission-engine` directly — that
  package's index also re-exports the Postgres-backed stores (which
  import `pg`), and a client bundle pulling that in breaks the build.
  The dimension list is fetched server-side (the page component) and
  passed down as a prop instead — caught by actually running `next
  build`, not by inspection.
- **Campaigns** (`/campaigns`, `/campaigns/new`, `/campaigns/[id]`, step
  16) — Promote.fun campaign import and creative-concept review. The
  list and new-campaign pages are what you'd expect; the detail page
  shows a campaign's normalized data (audience, benefits, allowed/
  forbidden claims, CTA), a "Generate concepts" button
  (`generateConcepts()` in `app/campaigns/actions.ts`, calling
  `generateConceptsOnce()`), and every past concept-generation run with
  its concepts sorted highest score first and a ★ on whichever the
  Creative Agent's deterministic scoring recommended. "Mark reviewed" is
  the only status a run has — there's no approve/reject yet because
  nothing downstream executes on a concept (no video, no publishing), so
  there's nothing yet for an approval to gate.
- **Growth** (`/growth`, step 20) — real follower counts per platform,
  one section per tracked business (TrendRush, Sproutlight — each
  guarded the same try/catch-on-`getBusiness()` way Campaigns/
  Sproutlight are, so a business that isn't registered yet just hides
  its section instead of crashing the page). Each platform card shows
  the current count, a handle if one's on file, and an inline form
  (`updateFollowerCount()` in `app/growth/actions.ts`) that writes
  straight through to `SocialAccountStore` — no client component, no
  `useActionState`, just a plain bound Server Action the same shape as
  `setOpportunityStatus`/`setCampaignStatus`. Only TrendRush's cards get
  a progress bar and a "not eligible yet"/"promote.fun eligible" badge
  — `CAMPAIGN_ELIGIBILITY_THRESHOLD = 200` lives in `page.tsx` itself,
  a UI-level constant computed against whatever the store returns, not
  a rule the database knows about. Sproutlight's cards show plain
  counts with no threshold framing, since it isn't seeking Promote.fun
  campaigns.
- **Clips** (`/clips`, step 23) — TrendRush's Clip Discovery Agent. A
  form (`ClipForm.tsx`, `'use client'`, same `useActionState` shape as
  `StoryConceptForm.tsx`) submits a clip description and an optional
  source URL; the evaluation list below shows each clip's virality
  score, a color-coded copyright-risk badge (reusing the existing
  green/yellow/red status-badge classes — `low`→`status-active`,
  `medium`→`status-abandoned`, `high`→`status-denied`), the
  recommendation, and per-platform captions expandable behind a
  `<details>`. No approve/reject here either — same reasoning as
  Campaigns/Sproutlight's concepts: no repost executor exists yet for
  anything to approve.
- **Sproutlight** (`/story-concepts`, step 19) — Sproutlight's
  nursery-rhyme/short-story concepts, a third business
  (`getSproutlightBusiness()`). A form (`StoryConceptForm.tsx`, `'use
  client'`, same `useActionState` shape as `CampaignForm.tsx`) submits a
  theme and a format (song/story); the full concept list below shows
  script, scenes (collapsed behind a `<details>` — a concept's scenes
  are supporting detail, not the headline), educational takeaway, and
  the model's own safety notes, most recent first. No approve/reject
  here either, same reasoning as Campaigns' concepts.

## Visual design (dark/purple command-center redesign)

A visual-only restyle — no new pages, routes, or data. `globals.css`
switched from a light-default/`prefers-color-scheme`-dark theme to a
single dark, purple-accented palette (`--bg`, `--bg-elevated`,
`--accent`/`--accent-strong` etc. in `:root`), matching a Jarvis-style
"command-center" reference the owner shared. `Nav.tsx` changed from a
horizontal top bar to a fixed left sidebar (icons from `lucide-react`,
the same icon package `nexalabs.tech`'s own Navbar already uses) — done
purely in CSS (`.nav { position: fixed; ... }` plus
`main:has(> .nav) { margin-left: var(--sidebar-w) }`) rather than by
touching every page's JSX, since every page already renders `<Nav
active="..." />` as the first child inside `<main>`; the `:has()`
selector is what lets `main` size itself correctly on `/login`, which
renders no `Nav` at all. Below a 900px viewport the sidebar reverts to a
horizontal icon-only bar (`nav-link span { display: none }`) rather than
adding a collapse/hamburger toggle — no new interactive behavior, just a
responsive layout, same spirit as the bento grid's existing 640px
breakpoint. `layout.tsx` added a Google Fonts link (Sora for display
text, JetBrains Mono for `.mono`/`.action-type`/data-heavy text) — the
first webfonts this package has loaded.

### Second pass — motion and real-data readouts

The owner asked for "crazier" and more fun after seeing the first static
restyle, but still real: every added element below reads a value the
page (or `Nav`) already fetches — nothing invents a number, and there's
still no voice UI, fake search, or fake system monitor.

- **`BootIntro.tsx`** (`'use client'`, mounted on Approvals only) — a
  ~1.5s "systems online" scan-line + typewriter flourish on first load
  of the dashboard *this browser session*, gated by
  `sessionStorage['nexa-boot-seen']` so it doesn't replay on every
  return to `/`. Renders `null` on the server pass and the client's
  first paint alike (state only flips inside a post-mount `useEffect`),
  so there's no hydration mismatch and no flash for repeat visits.
  Respects `prefers-reduced-motion` (skips straight to a fast fade
  instead of the scan/type animation).
- **`AnimatedNumber.tsx`** (`'use client'`) — counts a real server-fetched
  integer up from 0 on mount (`requestAnimationFrame`, eased, ~700ms).
  Initial React state is the real value (not 0), so SSR/first-paint HTML
  is already correct before the animation takes over — same
  no-hydration-mismatch pattern as `BootIntro`. Used for the bento
  grid's Pending/Agents/Top-opportunity/Campaigns tiles; the Money tile
  keeps its plain currency string since animating a formatted amount
  frame-by-frame reads as a glitch, not a counter.
- **Real-data charts, no charting library** — `lib/sparkline.ts`
  (`sparklinePath()`) turns a numeric series already on the page into
  SVG polyline/polygon coordinates; Money renders it as a "Transaction
  trend" line+area chart over the same `transactions` slice the list
  below it uses (own query already made, no new one). Activity buckets
  its already-fetched 50-row audit feed into a 7-day request-volume bar
  chart (`last7DayCounts()`) — capped by that same 50-row fetch, so a
  very busy week would undercount its oldest days rather than lying
  about zero activity; that's a documented approximation, not a bug.
- **`.pulse-dot`** — a small glowing, gently pulsing status dot (pure
  CSS `@keyframes`, disabled under `prefers-reduced-motion`) next to
  every real "active" reading: each active agent's badge on Activity,
  the Agents bento tile, and `Nav`'s own sidebar readout below.
- **`Nav.tsx` now fetches its own data** — `loadAgentStatus()` calls
  `getBusiness()` + `agentStore.listByBusiness()` (same nexa-labs
  default every other unscoped page falls back to) to show "`x/y agents
  online`" at the bottom of the sidebar on every page, not just
  Approvals. Wrapped in a try/catch the same way the bento grid's
  `loadCampaignCount()` is — a business that isn't set up yet hides the
  readout instead of taking the sidebar down. This is the one place
  visual work turned into a real (small, cheap) extra query per page
  load, traded deliberately for the sidebar being alive on every page
  rather than only the one that already happened to fetch agent counts.
- **Ambient background + HUD corner brackets** — `body::before`/`::after`
  add a slow-drifting radial glow (`prefers-reduced-motion`-guarded) and
  a faint fixed scanline texture, both `z-index: -1` and
  `pointer-events: none` so they never intercept clicks or affect
  layout. `.bento-tile--hero` and `.chart-card` get small accent corner
  brackets (`::before`/`::after`, absolutely positioned) for the
  "targeting HUD" look from the reference screenshot.

### Third pass — full sci-fi HUD overhaul

The owner asked to ditch the design so far entirely for something
"fully futuristic/sci-fi." This pass changed the shared visual
language, not the data or the layout skeleton underneath it — every
page still renders the same components with the same props, just
against a much more aggressively styled CSS layer.

- **Angular "beveled panel" shape everywhere** — `--panel-clip`/
  `--panel-clip-sm` (`:root` in `globals.css`) are `clip-path:
  polygon(...)` shapes that slice the top-left and bottom-right corners
  off every bordered surface (`.card`, `.agent-card`, `.event-list`,
  `.chart-card`, `.growth-card`, `.bento-tile`, `.bar-chart`,
  `form.login-form`, buttons, badges, inputs), replacing `border-radius`
  everywhere it used to appear. HUD corner brackets (`::before`/`::after`)
  moved to the two corners clip-path *doesn't* cut (top-right/
  bottom-left) and now appear on every panel class above, not just the
  Approvals hero tile and Money's chart card.
- **`box-shadow` glow → `filter: drop-shadow` on every clipped element**
  — a real CSS gotcha, not a style preference: `clip-path` hard-clips
  `box-shadow` at the polygon edge, so a glow that used to bleed outward
  smoothly would instead cut off in a straight line at each panel's
  slanted corner. `filter: drop-shadow()` is computed from the
  already-clipped shape's alpha channel instead, so it glows around the
  angular silhouette correctly. Every hover/ambient glow that used to be
  `box-shadow` (cards, the bento hero tile, buttons, status badges,
  focus rings) was converted; `.pulse-dot`'s ring animation and
  `.sparkline-dot` were left alone since neither sits on a clipped
  element.
- **Command-panel typography** — nav links, buttons, `.button-link`,
  and the brand wordmark switched to uppercase + wide letter-spacing in
  `--font-display`, reading as HUD controls rather than a normal web
  app's buttons. `.status-badge` changed from a rounded pill to a
  single-notch angular tag (`polygon(6px 0, 100% 0, 100% 100%, 0 100%,
  0 6px)`).
- **A denser HUD background** — `body::after` gained a faint 64px grid
  (two `repeating-linear-gradient` layers) layered under the existing
  scanlines, all still under ~6% opacity and `z-index: -1` so it reads
  as atmosphere, not noise.
- **A decorative rotating ring** on the Approvals hero tile
  (`.hero-ring`, a real DOM element in `page.tsx` since `.bento-tile`
  already uses both its `::before`/`::after` slots for corner brackets)
  — two concentric dashed/solid circles behind the Pending number,
  rotating via a `prefers-reduced-motion`-guarded CSS animation. Purely
  ambient: it isn't tied to any real ratio, unlike the gauges below,
  since Pending has no natural "out of what" denominator to plot
  honestly.
- **Growth's linear progress bars became circular radial gauges** — an
  inline SVG per platform card (`growth/page.tsx`), `stroke-dasharray`/
  `stroke-dashoffset` computed server-side from the same real
  `followerCount`/threshold math the old `<div style={{ width }}>` bar
  used, just drawn as a ring with the count centered inside instead of
  a bar underneath. Sproutlight's threshold-less cards still render a
  plain number, same reasoning as before — no gauge without a real
  denominator to honestly fill it against.

### Fourth pass — Approvals dropped the bento grid for a HUD command center

The owner shared a screenshot of a personal-assistant "command center"
UI (multi-panel HUD around a central circular readout — agent status,
a live signal feed, system meters, a grid of quick-action buttons) and
asked for that instead of the bento grid. Every number in the result is
still real; nothing here is a fabricated system-diagnostic readout the
way the reference image's own "GPU VRAM"/"SHIELD INTEGRITY" bars were
for its use case.

`page.tsx`'s `<div className="bento-grid">` became `<div
className="hud-grid">` — a 3-column CSS grid (`.hud-grid` in
`globals.css`, collapsing to one column under 1080px same pattern as
the sidebar's 900px breakpoint) of:

- **Agent roster** and **Recent signals** panels (left column) — the
  same `agents`/`feed` this page already fetched for the old Agents/
  Latest-activity tiles, just rendered as list panels instead of single
  stat tiles. `feed`'s query limit went from 1 row to 6 so there's
  enough for an actual feed, not a single line.
- **The reactor** (center column, `.reactor-panel`/`.reactor`) — the
  real pending count, large, inside the same rotating dashed ring the
  bento hero tile used (`.hero-ring`, unchanged, just re-parented).
  Below it, a real "focus" readout: the most recently requested pending
  approval's real `actionType`, and its real `confidence` (`ActionRequest.
  confidence`, `src/types.ts`) *only* when the agent that drafted it
  actually supplied one — most don't, and the readout simply omits the
  confidence line rather than inventing a percentage the way a generic
  HUD mockup would. Falls back to the latest audit entry when nothing's
  pending.
- **System metrics** and **Quick access** panels (right column) — the
  same agents-active ratio and top-opportunity score as real horizontal
  meters (a meter only appears where there's a real 0-100 or x-of-y
  ratio to fill it honestly; latest money and campaign count stay plain
  readouts, same reasoning as Growth's gauges only appearing where
  there's a real denominator). Quick access is six real `<Link>`s to
  the other pages, icon-styled like the reference's command grid.

`HudPanel` (a small local, non-exported component in `page.tsx`) is the
one shared header (icon + title + optional badge) every side panel
renders through, rather than repeating that markup four times.

## Demo page (step 21, merged into Approvals by step 22 — see that section)

**Superseded by step 22**: the owner asked to merge this into the real
operating deck rather than maintain two dashboards; the `/demo` route
no longer exists. Left here as the historical record of what step 21
actually shipped, per this file's own append-only convention — read
step 22 for the current state.

A standalone, full-bleed "command center" view (`/demo`) built for
recording a clip, after the owner pointed out that the flashy
fully-automated "Jarvis" AI demos circulating on social media are
almost always a thin, often-fake front end over no real backend —
where Nexa AI is the opposite (a real permission engine, a real audit
trail, real businesses). The ask was for something with that visual
impact, without pretending to be something it isn't: everything on
this page is a real value the request actually fetched, same standard
as everywhere else in this app. No voice UI, no chat box that doesn't
do anything, no invented system diagnostics.

Deliberately not linked from `Nav` or wrapped in the sidebar layout —
it's a recording surface, not a daily operating page, and staying
decoupled means neither page has to compromise for the other. It still
sits behind `verifySession()` like every other page.

- **No sidebar** — `main:has(> .demo-page)` (`globals.css`, same
  `:has()` trick `main:has(> .nav)` already uses) resets `main`'s
  default centered max-width to full-bleed when it detects the page
  rendered no `<Nav>`.
- **The core** — a bigger, three-ring version of the Approvals hero's
  `.hero-ring` (three concentric rings spinning at different speeds/
  directions), with the real pending count in the center and a real
  `{business.name} · OPERATIONAL` status line below it.
- **Real panels either side** — Agent roster (same data as the
  Approvals HUD grid's panel) and a Top Opportunity radial gauge
  (`gaugeCircumference()`/`gaugeDashoffset()`, factored out of
  `growth/page.tsx` into `lib/radialGauge.ts` so both pages share the
  exact same ring geometry instead of duplicating it) — plain accent
  color, not the green "threshold met" variant Growth uses, since a
  score has no pass/fail state to signal.
- **A wide live activity feed** (12 real audit rows, scrollable) below
  the three-column row, and a bottom status bar reading real pending
  count, real agents-online ratio, and the real model every agent
  calls (`MODEL_LABEL` mirrors `src/llm/client.ts`'s `MODEL` constant
  in `@nexa-ai/permission-engine` — shown because it's true, not
  because "Claude Opus 5" reads well).
- **`LiveClock.tsx`** (`'use client'`) — a real ticking local clock in
  the top bar, `setInterval`-driven. Renders `null` until mounted (no
  reliable "now" during SSR/first paint), same no-hydration-mismatch
  pattern as `BootIntro`/`AnimatedNumber`.
- **Entrance choreography, not a replay-gated boot** — every panel
  gets a `.demo-enter` fade-and-rise animation with a staggered
  `animation-delay` (inline style, since each panel needs a different
  delay). Unlike `BootIntro`, this isn't `sessionStorage`-gated: for a
  page built to be reloaded and re-recorded, replaying identically
  every time is the point, not a bug to gate away.

## The demo page merged into Approvals, with its own core (step 22)

Two asks in quick succession: merge `/demo` into the real operating
deck instead of maintaining two dashboards, then — once that landed —
"make it *like* a Jarvis deck, not fully Jarvis deck… make a unique
deck for Nexa AI." The merge is structural (one page, one dataset,
`/demo/page.tsx` deleted); the second ask changed what the core itself
looks like, not just where it lives.

**The merge.** Approvals' `hud-grid` gained the demo's richer pieces
directly rather than importing them from a second page:

- The reactor's core (see below) replaces the old single-ring
  `.hero-ring`/`.reactor-core` — those classes are gone from
  `globals.css`, not just unused.
- **Top opportunity** became its own panel with the radial gauge
  (previously a linear meter buried in System Metrics), sitting in the
  left column under Agent Roster — freeing System Metrics down to
  agents-online + money + campaigns.
- **Recent signals** (6 rows, left column) became a wide **Live
  activity feed** panel (12 rows, scrollable) below the 3-column grid —
  the demo page's proportions, not the original HUD grid's.
- **`LiveClock`** moved into `.page-header-row`, next to the h1/subtitle,
  instead of a page's own top bar (Approvals already has `<Nav>` for
  that role).
- **`.deck-statusbar`** (real pending/agents/model) sits right above
  "Pending approvals."
- Every panel gained a `.deck-enter` staggered fade-in — reusing the
  demo's entrance choreography rather than the plain page it replaced.
- All the reusable CSS carried over renamed from `demo-*` to `deck-*`
  (`.demo-core` → `.deck-core`, `.demo-feed-panel` → `.deck-feed-panel`,
  etc.); the page-layout-only classes that only made sense for a
  sidebar-less full-bleed page (`.demo-page`, `.demo-topbar`,
  `.demo-brand*`, `.demo-tagline`, `.demo-grid`, and the
  `main:has(> .demo-page)` override) were deleted outright rather than
  left as dead CSS.

**The core, redesigned to be Nexa's own.** The three plain concentric
circles read as a generic sci-fi HUD reference's "arc reactor" — not
wrong, but not *ours*. The rebuilt `.deck-core`:

- **A hexagonal outer ring** (`clip-path: polygon(...)`, same angular
  technique every panel in this app already uses for its beveled
  corners) in place of a third circle — reads as circuit/network
  rather than a power core.
- **The real `BrainCircuit` icon at dead center** — Nexa AI's own mark,
  not a plain "Nexa" wordmark — with the real pending count and
  "pending" label stacked under it.
- **One real node per registered agent**, placed at a true angle around
  the mid ring's circumference (`coreNodePosition()` in `page.tsx` —
  server-side trigonometry, not CSS or client JS), lit and pulsing
  (`.deck-core-node--active`, reusing the existing `pulse-ring`
  keyframe `.pulse-dot` already uses elsewhere) only for agents that
  are actually active, dim otherwise. This is the piece that makes the
  core specifically *Nexa's* rather than a reskinned template: it's a
  literal, truthful small multiple of the real fleet, not decoration —
  three agents currently means three dots, and that number changes the
  moment `db:register-agent` or a deactivation does.

Verified live in the browser at desktop and mobile widths (the
hexagon/node core holds up at both), confirmed `/demo` now 404s, and
reran the full lint/typecheck/test suite green after the route
deletion (a stale `.next` build cache initially referenced the deleted
route's generated types — cleared, not silenced).

`src/lib/business.ts`'s `getBusiness(slug?)` is the one place that
resolves a business by slug — still honestly single-tenant *per page
area* rather than truly multi-business (no switcher UI), but step 16 was
the first real second business, so `getBusiness()` takes an optional
slug (default `nexa-labs`, unchanged for every existing call site);
`getPromoteFunBusiness()` and step 19's `getSproutlightBusiness()`
resolve the other two the same way. Every page still goes through one
of these three functions rather than repeating a slug.

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

Since step 12, this route also calls `engine.reapAbandonedRequests()` on
every run — the only place a request abandoned by a crashed process ever
gets discovered and marked (see the permission-engine README's step 12
section). The Activity page labels such a row "abandoned" with an amber
badge, distinct from a normal "denied" (red) or "executed" (green) one,
and shows the reason the same way a denial's reason is shown.

Since step 14, this route also calls `triggerTransactionReview()`
(`src/lib/transactionReview.ts`, same shape as `triggerWaitlistTriage()`)
after ingesting transactions — the second agent, reviewing what's new
and drafting an owner alert for anything worth a look. Optional per
business: if no `transaction-review` agent is registered yet, this
reports `{ skipped: '...' }` rather than failing the whole cron run,
since reviewing transactions only makes sense once Stripe or the crypto
wallet is actually configured for this business.

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

## Sanity webhook (step 9)

`src/app/api/webhooks/sanity/route.ts` — the push counterpart to the
cron route, for events specifically. Reacts to a new waitlist signup or
contact message immediately instead of waiting for the once-daily poll;
see that route file's top comment for the exact Sanity webhook
configuration (URL, filter, projection, secret). Authenticated by
verifying Sanity's own request signature via the official
`@sanity/webhook` package, not `CRON_SECRET` — the right model for a
webhook a third party calls with its own documented signing scheme.
`SANITY_WEBHOOK_SECRET` is optional; without it, events still arrive via
the daily poll, just slower.

Shares `src/lib/triage.ts`'s `triggerWaitlistTriage()` with the cron
route — both just ingest, then call it, so "how the agent gets run"
stays in one place regardless of what triggered it. Skips the triage
run entirely on a duplicate delivery (Sanity does retry) — `inserted`
is checked first, so a redundant delivery doesn't trigger a redundant
agent run.

Verified locally end to end with real signature generation/verification
(the official package's own `encodeSignatureHeader`, not a mock) against
a real running dev server and real Postgres — valid signature, wrong
secret, missing signature header, and a duplicate delivery all behaved
correctly. Couldn't verify an actual delivery *from* Sanity itself
(sanity.io is blocked from this sandbox, same as earlier steps) — that
needs a real webhook configured and fired at a real deployment.

## Owner notification (step 10)

Every process that constructs the engine (this dashboard, and any
future one) can wire a `Notifier` so `requestAction()` emails every
owner the moment something needs a decision — closing the direction
step 9 didn't: events can reach an agent fast now, but the owner still
had to remember to check the dashboard to see what it drafted.

`getEngine()` wires `createResendEmailNotifier()` the same way it wires
`registerSendEmailExecutor()` — constructed once, and a missing
`RESEND_API_KEY` is caught and logged (`email notifier not configured:
...`), not thrown; login and the approval queue keep working with
notifications simply off. Verified locally: with `RESEND_API_KEY`
unset, a real login through a real browser produced exactly that log
line alongside the executor's own, and the dashboard functioned
normally throughout.

## Auto-approval visibility (step 11, policy replaced in step 18)

What this app adds is visibility, not the policy itself (that's
`engine.ts`'s `shouldAutoApprove()`, permission-engine's own concern):
the Activity page's audit log labels each executed action by how it was
resolved, so an agent auto-executing doesn't make its decisions
disappear from view. Originally built for step 11's narrow, opt-in
autonomy-level-2 promotion (`npm run db:set-agent-autonomy`, an operator
action, now removed) — since step 18 the same label now applies to
*most* executed actions by default, not the exception, since only
money-spending requests still wait on an owner click. Verified locally
against real Postgres both times: step 11's original version set an
agent to level 2 with a confidence threshold and confirmed the label;
step 18's `npm run db:discover-opportunities` (packages/permission-engine/db/README.md)
and a live "Discover opportunities" button click both produced real
"auto-approved by policy" rows with no code changes needed to this
page — the label logic (`resolvedBy` unset = auto-approved) never
depended on *why* something auto-approved, only *whether* it did.
