import type { JsonValue } from '../json.js'

export type BusinessRecord = {
  id: string
  slug: string
  name: string
  status: 'active' | 'paused' | 'archived'
}

export interface BusinessStore {
  getConfig(businessId: string): Promise<JsonValue>
  /** Step 8: lets a caller (e.g. the dashboard's cron route) resolve an id without raw SQL. */
  getBySlug(slug: string): Promise<BusinessRecord | undefined>
}
