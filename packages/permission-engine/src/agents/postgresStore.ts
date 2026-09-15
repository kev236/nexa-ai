import type { Pool } from 'pg'
import { getPool } from '../db.js'
import type { JsonValue } from '../json.js'
import type { AgentRecord, AgentStore } from './store.js'

type Row = {
  id: string
  business_id: string
  key: string
  role: string
  config: JsonValue
  active: boolean
  created_at: string
}

function toRecord(row: Row): AgentRecord {
  return {
    id: row.id,
    businessId: row.business_id,
    key: row.key,
    role: row.role,
    config: row.config,
    active: row.active,
    createdAt: row.created_at,
  }
}

export class PostgresAgentStore implements AgentStore {
  constructor(private readonly pool: Pool = getPool()) {}

  async getByKey(businessId: string, key: string): Promise<AgentRecord | undefined> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM agents WHERE business_id = $1 AND key = $2`,
      [businessId, key]
    )
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async getById(agentId: string): Promise<AgentRecord | undefined> {
    const result = await this.pool.query<Row>(`SELECT * FROM agents WHERE id = $1`, [agentId])
    const row = result.rows[0]
    return row ? toRecord(row) : undefined
  }

  async listByBusiness(businessId: string): Promise<AgentRecord[]> {
    const result = await this.pool.query<Row>(
      `SELECT * FROM agents WHERE business_id = $1 ORDER BY created_at ASC`,
      [businessId]
    )
    return result.rows.map(toRecord)
  }
}

export function createPostgresAgentStore(): AgentStore {
  return new PostgresAgentStore()
}
