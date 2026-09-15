import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { ContentConcept } from './types.js'
import type { ContentConceptRunInput, ContentConceptRunRecord, ContentConceptStore } from './store.js'

type Row = {
  id: string
  campaign_id: string
  business_id: string
  agent_id: string | null
  concepts: ContentConcept[]
  reasoning: string
  confidence: number | null
  status: ContentConceptRunRecord['status']
  created_at: string
}

function toRecord(row: Row): ContentConceptRunRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    businessId: row.business_id,
    agentId: row.agent_id ?? undefined,
    concepts: row.concepts,
    reasoning: row.reasoning,
    confidence: row.confidence ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  }
}

export class PostgresContentConceptStore implements ContentConceptStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async create(input: ContentConceptRunInput): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO content_concepts (campaign_id, business_id, agent_id, concepts, reasoning, confidence, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', now())
       RETURNING id`,
      [
        input.campaignId,
        input.businessId,
        input.agentId ?? null,
        JSON.stringify(input.concepts),
        input.reasoning,
        input.confidence ?? null,
      ]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('content_concepts insert returned no id')
    return id
  }

  async get(id: string): Promise<ContentConceptRunRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM content_concepts WHERE id = $1', [id])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async markReviewed(id: string): Promise<void> {
    await this.pool.query(`UPDATE content_concepts SET status = 'reviewed' WHERE id = $1`, [id])
  }

  async listByCampaign(campaignId: string, limit = 100): Promise<ContentConceptRunRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM content_concepts WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [campaignId, limit]
    )
    return result.rows.map(toRecord)
  }
}

export function createPostgresContentConceptStore(): ContentConceptStore {
  return new PostgresContentConceptStore()
}
