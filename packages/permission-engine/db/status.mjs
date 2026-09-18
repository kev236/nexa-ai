#!/usr/bin/env node
// Read-only. Reports, in one pass, exactly what's set up against the
// real database and what isn't — every business this codebase expects,
// the agent each one needs to actually do anything, pending migrations,
// whether an owner account exists to log in with, and which optional
// integrations have real credentials configured. Nothing here writes
// anything; run the db:register-business / db:register-agent / db:migrate
// / db:create-owner commands it points at to close a gap.
//
// Usage: npm run db:status
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in, or export it directly.')
  process.exit(1)
}

// Every business + agent this codebase actually reads by slug/key
// somewhere (packages/dashboard/src/lib/business.ts and each business's
// own action file) — kept here as the single source of what "fully set
// up" means, not re-derived from the database itself.
const EXPECTED = [
  {
    slug: 'nexa-labs',
    name: 'Nexa Labs (nexalabs.tech)',
    agents: [
      { key: 'waitlist-triage', required: true, note: 'cron/webhook ingestion fails its run without this one' },
      { key: 'transaction-review', required: false, note: 'skipped, not failed, when absent — see lib/transactionReview.ts' },
      { key: 'opportunity-discovery', required: false, note: 'only needed for the "Discover opportunities" button' },
    ],
  },
  {
    slug: 'promote-fun',
    name: 'Promote.fun',
    agents: [{ key: 'creative-agent', required: false, note: 'optional — concept generation works without it too' }],
  },
  {
    slug: 'sproutlight',
    name: 'Sproutlight',
    agents: [{ key: 'story-concept-agent', required: true, note: 'needed for both generating and posting concepts' }],
  },
  {
    slug: 'trendrush',
    name: 'TrendRush',
    agents: [{ key: 'clip-discovery-agent', required: true, note: 'needed for both evaluating and posting clips' }],
  },
  {
    slug: 'dropshipping',
    name: 'Dropshipping',
    agents: [],
  },
]

const client = new pg.Client({ connectionString })
await client.connect()

function section(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`)
}

try {
  section('Migrations')
  const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url))
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()
  let appliedNames = new Set()
  try {
    const applied = await client.query('SELECT name FROM schema_migrations')
    appliedNames = new Set(applied.rows.map((r) => r.name))
  } catch {
    console.log('  schema_migrations table does not exist yet — no migration has ever run.')
  }
  const pending = files.filter((f) => !appliedNames.has(f))
  if (pending.length === 0) {
    console.log(`  All ${files.length} migrations applied. Up to date.`)
  } else {
    console.log(`  ${pending.length} pending (run: npm run db:migrate):`)
    for (const f of pending) console.log(`    - ${f}`)
  }

  section('Owner account (dashboard login)')
  const owners = await client.query('SELECT email FROM owners LIMIT 5').catch(() => ({ rows: [] }))
  if (owners.rows.length === 0) {
    console.log('  None. Log in will fail until you run: npm run db:create-owner -- <email> <password>')
  } else {
    console.log(`  ${owners.rows.length} owner account(s): ${owners.rows.map((r) => r.email).join(', ')}`)
  }

  section('Businesses and agents')
  for (const biz of EXPECTED) {
    const result = await client.query('SELECT id FROM businesses WHERE slug = $1', [biz.slug]).catch(() => ({ rows: [] }))
    const businessId = result.rows[0]?.id
    if (!businessId) {
      console.log(`  [MISSING] ${biz.name} (${biz.slug})`)
      console.log(`    run: npm run db:register-business -- ${biz.slug} "${biz.name}"`)
      continue
    }
    console.log(`  [OK] ${biz.name} (${biz.slug})`)
    for (const agent of biz.agents) {
      const agentResult = await client
        .query('SELECT active FROM agents WHERE business_id = $1 AND key = $2', [businessId, agent.key])
        .catch(() => ({ rows: [] }))
      const row = agentResult.rows[0]
      if (!row) {
        const tag = agent.required ? 'MISSING — required' : 'missing — optional'
        console.log(`    [${tag}] agent '${agent.key}' (${agent.note})`)
        console.log(`      run: npm run db:register-agent -- ${biz.slug} ${agent.key} "<role description>"`)
      } else if (!row.active) {
        console.log(`    [INACTIVE] agent '${agent.key}' exists but active = false — it will never auto-execute anything`)
      } else {
        console.log(`    [OK] agent '${agent.key}'`)
      }
    }
    if (biz.slug === 'trendrush' || biz.slug === 'sproutlight') {
      const oauth = await client
        .query(`SELECT 1 FROM oauth_credentials WHERE business_id = $1 AND platform = 'youtube'`, [businessId])
        .catch(() => ({ rows: [] }))
      console.log(
        oauth.rows.length > 0
          ? '    [OK] YouTube connected (real upload credential on file)'
          : '    [missing] YouTube not connected — visit /growth and click "Connect YouTube" for this business'
      )
    }
  }

  section('Optional integrations (env vars — checked on this machine, not the database)')
  const checks = [
    ['Resend (email sending)', ['RESEND_API_KEY']],
    ['Stripe (nexa-labs transactions)', ['STRIPE_SECRET_KEY']],
    ['Crypto wallet watch (nexa-labs transactions)', ['ETHERSCAN_API_KEY', 'WALLET_ADDRESS']],
    ['Shopify (dropshipping orders)', ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET']],
    ['YouTube OAuth (TrendRush + Sproutlight posting)', ['YOUTUBE_OAUTH_CLIENT_ID', 'YOUTUBE_OAUTH_CLIENT_SECRET', 'YOUTUBE_OAUTH_REDIRECT_URI']],
    ['YouTube Data API (follower sync)', ['YOUTUBE_API_KEY']],
    ['TikTok OAuth', ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET']],
    ['Sanity CMS', ['SANITY_PROJECT_ID', 'SANITY_DATASET']],
    ['Sanity webhook (push events)', ['SANITY_WEBHOOK_SECRET']],
    ['Self-improvement agent', ['GITHUB_TOKEN', 'GITHUB_REPOSITORY']],
  ]
  for (const [label, vars] of checks) {
    const missing = vars.filter((v) => !process.env[v])
    console.log(missing.length === 0 ? `  [OK] ${label}` : `  [missing] ${label} — needs ${missing.join(', ')}`)
  }

  console.log('\nDone. This only reports what exists — it never writes anything.')
} finally {
  await client.end()
}
