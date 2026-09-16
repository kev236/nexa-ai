'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { getEngine } from '@/lib/engine'
import { PLATFORMS, type Platform } from '@nexa-ai/permission-engine'

function isPlatform(value: FormDataEntryValue | null): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value)
}

/**
 * Bound to a business id from the form (`updateFollowerCount.bind(null,
 * business.id)`), same pattern as setOpportunityStatus/setCampaignStatus
 * — plain owner-entered data, no requestAction()/approval needed (see
 * SocialAccountStore's own doc comment).
 */
export async function updateFollowerCount(businessId: string, formData: FormData): Promise<void> {
  await verifySession()

  const platform = formData.get('platform')
  if (!isPlatform(platform)) return

  const followerCount = Math.round(Number(formData.get('followerCount')))
  if (!Number.isFinite(followerCount) || followerCount < 0) return

  const handle = formData.get('handle')

  await getEngine().socialAccountStore.setFollowerCount(
    businessId,
    platform,
    followerCount,
    typeof handle === 'string' && handle.trim() ? handle.trim() : undefined
  )
  revalidatePath('/growth')
}
