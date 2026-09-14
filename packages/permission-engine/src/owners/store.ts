export type OwnerRecord = {
  id: string
  email: string
  passwordHash: string
  createdAt: string
}

export interface OwnerStore {
  findByEmail(email: string): Promise<OwnerRecord | undefined>
  get(ownerId: string): Promise<OwnerRecord | undefined>
}
