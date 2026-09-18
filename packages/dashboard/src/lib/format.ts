/**
 * A real display name, derived from the real owner's account email —
 * never a placeholder or invented name. First name only, the way the
 * owner asked to be addressed: "kevin.mlocek2007@gmail.com" -> "Kevin",
 * not "Kevin Mlocek2007".
 */
export function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? email
  const firstPart = localPart.split(/[._-]+/).filter(Boolean)[0] ?? localPart
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1)
}

/**
 * A real elapsed-time readout from a real ISO timestamp — "14s ago",
 * "8m ago", "3h ago" — falling back to a real localized date once it's
 * further out than a day, rather than an ever-growing "412h ago".
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const thenMs = new Date(iso).getTime()
  const diffSec = Math.max(0, Math.round((now.getTime() - thenMs) / 1000))

  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** actionType -> a human sentence, for the few real actionTypes this system's agents actually use (send_email, propose_opportunity). Anything unmapped is humanized ("some_action" -> "Some action") rather than guessed at. */
export function humanizeActionType(actionType: string): string {
  const known: Record<string, string> = {
    send_email: 'Sent an email',
    propose_opportunity: 'Proposed a business opportunity',
  }
  if (known[actionType]) return known[actionType]
  const words = actionType.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function formatAmount(amountCents: number, currency: string): string {
  const amount = amountCents / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount)
  } catch {
    // Not every currency here is a real ISO code (USDC isn't) — Intl throws on those.
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}
