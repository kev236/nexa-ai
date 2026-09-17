#!/usr/bin/env node
// Step 26: historical load of the dropshipping business's real Shopify
// orders into `transactions` — read-only, same as backfillNexaLabs.mjs's
// Stripe/crypto side. Requires the package to be built first (npm run
// build, here or via build:permission-engine at the repo root) since it
// imports dist/, and requires SHOPIFY_SHOP_DOMAIN / SHOPIFY_ADMIN_API_ACCESS_TOKEN
// plus DATABASE_URL — see .env.example.
import pg from 'pg'
import { createShopifyAdapter, createPermissionEngine, createPostgresTransactionStore } from '../dist/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString })

try {
  const business = await pool.query(`SELECT id FROM businesses WHERE slug = 'dropshipping'`)
  const businessId = business.rows[0]?.id
  if (!businessId) {
    console.error("No business with slug 'dropshipping' found — run db:register-business first.")
    process.exit(1)
  }

  const adapter = createShopifyAdapter()
  const health = await adapter.healthCheck()
  if (!health.ok) {
    console.error('ShopifyAdapter health check failed:', health.detail)
    process.exit(1)
  }
  console.log('connected to Shopify store:', health.detail)

  const engine = createPermissionEngine({ transactionStore: createPostgresTransactionStore() })
  const summary = await engine.ingestTransactions(adapter, businessId)
  console.log('orders backfill complete:', summary)
} finally {
  await pool.end()
}
