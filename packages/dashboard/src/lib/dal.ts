import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { readSession } from './session'

/**
 * The one place that decides "is there a real, authenticated owner behind
 * this request." Every page, Server Action, and route handler that needs
 * to know who's asking should call this rather than reading the cookie
 * itself — see docs/plan-001-foundations.md and the Next.js auth guide's
 * Data Access Layer pattern this follows.
 */
export const verifySession = cache(async (): Promise<{ ownerId: string }> => {
  const session = await readSession()
  if (!session) {
    redirect('/login')
  }
  return { ownerId: session.ownerId }
})
