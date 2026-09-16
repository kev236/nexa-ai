import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { ClipCaption, ClipInput, ClipRecord, ClipStore } from './store.js'

type Row = {
  id: string
  business_id: string
  source_url: string | null
  source_description: string
  title: string
  virality_score: number
  copyright_risk: ClipRecord['copyrightRisk']
  copyright_notes: string
  recommendation: string
  captions: ClipCaption[]
  reasoning: string
  confidence: number | null
  created_at: string
}

function toRecord(row: Row): ClipRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    sourceUrl: row.source_url ?? undefined,
    sourceDescription: row.source_description,
    title: row.title,
    viralityScore: row.virality_score,
    copyrightRisk: row.copyright_risk,
    copyrightNotes: row.copyright_notes,
    recommendation: row.recommendation,
    captions: row.captions,
    reasoning: row.reasoning,
    confidence: row.confidence ?? undefined,
    createdAt: row.created_at,
  }
}

export class PostgresClipStore implements ClipStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async create(businessId: string, input: ClipInput): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO clips
         (business_id, source_url, source_description, title, virality_score, copyright_risk, copyright_notes, recommendation, captions, reasoning, confidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       RETURNING id`,
      [
        businessId,
        input.sourceUrl ?? null,
        input.sourceDescription,
        input.title,
        input.viralityScore,
        input.copyrightRisk,
        input.copyrightNotes,
        input.recommendation,
        JSON.stringify(input.captions),
        input.reasoning,
        input.confidence ?? null,
      ]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('clips insert returned no id')
    return id
  }

  async get(id: string): Promise<ClipRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM clips WHERE id = $1', [id])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async listByBusiness(businessId: string, limit = 100): Promise<ClipRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM clips WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [businessId, limit]
    )
    return result.rows.map(toRecord)
  }
}

export function createPostgresClipStore(): ClipStore {
  return new PostgresClipStore()
}
