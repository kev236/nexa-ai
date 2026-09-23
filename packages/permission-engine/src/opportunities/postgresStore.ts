import type { Pool } from 'pg'
import { getPool } from '../db.js'
import { assertOpportunityScores, computeTotalScore, type OpportunityScores } from './scoring.js'
import type { OpportunityInput, OpportunityRecord, OpportunityStore } from './store.js'

type Row = {
  id: string
  name: string
  problem: string
  target_customer: string
  scores: OpportunityScores
  total_score: number
  recommendation: string
  status: OpportunityRecord['status']
  proposed_by_agent_id: string | null
  created_at: string
  updated_at: string
}

function toRecord(row: Row): OpportunityRecord {
  return {
    id: row.id,
    name: row.name,
    problem: row.problem,
    targetCustomer: row.target_customer,
    scores: row.scores,
    totalScore: row.total_score,
    recommendation: row.recommendation,
    status: row.status,
    proposedByAgentId: row.proposed_by_agent_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PostgresOpportunityStore implements OpportunityStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async create(input: OpportunityInput): Promise<string> {
    assertOpportunityScores(input.scores)
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO opportunities (name, problem, target_customer, scores, total_score, recommendation, status, proposed_by_agent_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, now(), now())
       RETURNING id`,
      [
        input.name,
        input.problem,
        input.targetCustomer,
        JSON.stringify(input.scores),
        computeTotalScore(input.scores),
        input.recommendation,
        input.proposedByAgentId ?? null,
      ]
    )
    const id = result.rows[0]?.id
    if (!id) throw new Error('opportunities insert returned no id')
    return id
  }

  async update(id: string, input: OpportunityInput): Promise<void> {
    assertOpportunityScores(input.scores)
    await this.pool.query(
      `UPDATE opportunities
       SET name = $2, problem = $3, target_customer = $4, scores = $5, total_score = $6, recommendation = $7, updated_at = now()
       WHERE id = $1`,
      [id, input.name, input.problem, input.targetCustomer, JSON.stringify(input.scores), computeTotalScore(input.scores), input.recommendation]
    )
  }

  async setStatus(id: string, status: 'open' | 'archived'): Promise<void> {
    await this.pool.query(`UPDATE opportunities SET status = $2, updated_at = now() WHERE id = $1`, [id, status])
  }

  async get(id: string): Promise<OpportunityRecord | undefined> {
    const result = await this.pool.query<Row>('SELECT * FROM opportunities WHERE id = $1', [id])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async list(): Promise<OpportunityRecord[]> {
    const result = await this.pool.query<Row>('SELECT * FROM opportunities ORDER BY total_score DESC')
    return result.rows.map(toRecord)
  }
}

export function createPostgresOpportunityStore(): OpportunityStore {
  return new PostgresOpportunityStore()
}
