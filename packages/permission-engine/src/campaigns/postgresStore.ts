import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { CampaignInput, CampaignRecord, CampaignStore } from './store.js'

type Row = {
  id: string
  business_id: string
  external_id: string | null
  product: string
  target_audience: string | null
  problem: string | null
  benefits: string[]
  unique_selling_points: string[]
  allowed_claims: string[]
  forbidden_claims: string[]
  cta: string | null
  landing_page: string | null
  available_assets: string[]
  raw_input: string | null
  status: CampaignRecord['status']
  created_at: string
  updated_at: string
}

function toRecord(row: Row): CampaignRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    externalId: row.external_id ?? undefined,
    product: row.product,
    targetAudience: row.target_audience ?? undefined,
    problem: row.problem ?? undefined,
    benefits: row.benefits,
    uniqueSellingPoints: row.unique_selling_points,
    allowedClaims: row.allowed_claims,
    forbiddenClaims: row.forbidden_claims,
    cta: row.cta ?? undefined,
    landingPage: row.landing_page ?? undefined,
    availableAssets: row.available_assets,
    rawInput: row.raw_input ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PostgresCampaignStore implements CampaignStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async create(businessId: string, input: CampaignInput): Promise<{ id: string; inserted: boolean }> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO campaigns
         (business_id, external_id, product, target_audience, problem, benefits,
          unique_selling_points, allowed_claims, forbidden_claims, cta, landing_page,
          available_assets, raw_input, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active', now(), now())
       ON CONFLICT (business_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
       RETURNING id, true AS inserted`,
      [
        businessId,
        input.externalId ?? null,
        input.product,
        input.targetAudience ?? null,
        input.problem ?? null,
        JSON.stringify(input.benefits ?? []),
        JSON.stringify(input.uniqueSellingPoints ?? []),
        JSON.stringify(input.allowedClaims ?? []),
        JSON.stringify(input.forbiddenClaims ?? []),
        input.cta ?? null,
        input.landingPage ?? null,
        JSON.stringify(input.availableAssets ?? []),
        input.rawInput ?? null,
      ]
    )
    if (result.rows[0]) return { id: result.rows[0].id, inserted: true }

    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM campaigns WHERE business_id = $1 AND external_id = $2`,
      [businessId, input.externalId]
    )
    const id = existing.rows[0]?.id
    if (!id) throw new Error('campaigns insert conflicted but no existing row was found')
    return { id, inserted: false }
  }

  async get(id: string): Promise<CampaignRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM campaigns WHERE id = $1', [id])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async setStatus(id: string, status: CampaignRecord['status']): Promise<void> {
    await this.pool.query(`UPDATE campaigns SET status = $2, updated_at = now() WHERE id = $1`, [id, status])
  }

  async listByBusiness(businessId: string, limit = 100): Promise<CampaignRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM campaigns WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [businessId, limit]
    )
    return result.rows.map(toRecord)
  }
}

export function createPostgresCampaignStore(): CampaignStore {
  return new PostgresCampaignStore()
}
