/**
 * A real display name, derived from the real owner's account email —
 * never a placeholder or invented name. "kevin@nexalabs.tech" -> "Kevin".
 */
export function displayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? email
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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
