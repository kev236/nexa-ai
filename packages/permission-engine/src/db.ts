import pg from 'pg'

/**
 * The permission engine's own infrastructure connection (its audit log and
 * approval persistence) — not a business credential in the sense
 * docs/plan-001-foundations.md section 3c means when it says adapters
 * never read process.env for their own secrets. This is this package's
 * own database, read from its own environment, same as any backend
 * service reads its own DATABASE_URL. Business credentials (Stripe,
 * Resend, Sanity tokens) are a separate concern, resolved from
 * business_credentials and injected into adapters — not handled here.
 */
let pool: pg.Pool | undefined

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Postgres-backed stores need it; the in-memory stores (the default) do not.'
      )
    }
    pool = new pg.Pool({ connectionString })
  }
  return pool
}

/** For tests only: drop the cached pool so a new DATABASE_URL takes effect. */
export function resetPool(): void {
  pool = undefined
}
