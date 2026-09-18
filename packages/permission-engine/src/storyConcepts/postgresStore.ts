import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { StoryConceptInput, StoryConceptRecord, StoryConceptStore, StoryScene } from './store.js'

type Row = {
  id: string
  business_id: string
  theme: string
  format: StoryConceptRecord['format']
  title: string
  age_range: string
  script: string
  scenes: StoryScene[]
  educational_takeaway: string
  safety_notes: string
  reasoning: string
  confidence: number | null
  created_at: string
  youtube_video_id: string | null
  youtube_posted_at: string | null
}

function toRecord(row: Row): StoryConceptRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    theme: row.theme,
    format: row.format,
    title: row.title,
    ageRange: row.age_range,
    script: row.script,
    scenes: row.scenes,
    educationalTakeaway: row.educational_takeaway,
    safetyNotes: row.safety_notes,
    reasoning: row.reasoning,
    confidence: row.confidence ?? undefined,
    createdAt: row.created_at,
    youtubeVideoId: row.youtube_video_id ?? undefined,
    youtubePostedAt: row.youtube_posted_at ?? undefined,
  }
}

export class PostgresStoryConceptStore implements StoryConceptStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async create(businessId: string, input: StoryConceptInput): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO story_concepts
         (business_id, theme, format, title, age_range, script, scenes, educational_takeaway, safety_notes, reasoning, confidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       RETURNING id`,
      [
        businessId,
        input.theme,
        input.format,
        input.title,
        input.ageRange,
        input.script,
        JSON.stringify(input.scenes),
        input.educationalTakeaway,
        input.safetyNotes,
        input.reasoning,
        input.confidence ?? null,
      ]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('story_concepts insert returned no id')
    return id
  }

  async get(id: string): Promise<StoryConceptRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM story_concepts WHERE id = $1', [id])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async listByBusiness(businessId: string, limit = 100): Promise<StoryConceptRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM story_concepts WHERE business_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [businessId, limit]
    )
    return result.rows.map(toRecord)
  }

  async markPosted(conceptId: string, youtubeVideoId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE story_concepts SET youtube_video_id = $2, youtube_posted_at = now() WHERE id = $1`,
      [conceptId, youtubeVideoId]
    )
    if (result.rowCount === 0) throw new Error(`no such story concept: ${conceptId}`)
  }
}

export function createPostgresStoryConceptStore(): StoryConceptStore {
  return new PostgresStoryConceptStore()
}
