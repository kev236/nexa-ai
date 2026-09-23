export type OwnerRecord = {
  id: string
  email: string
  passwordHash: string
  createdAt: string
}

export interface OwnerStore {
  findByEmail(email: string): Promise<OwnerRecord | undefined>
  get(ownerId: string): Promise<OwnerRecord | undefined>
  /** Step 10: who to notify when something needs a decision. */
  listAll(): Promise<OwnerRecord[]>
}
