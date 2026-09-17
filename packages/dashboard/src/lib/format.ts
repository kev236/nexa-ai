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

export function formatAmount(amountCents: number, currency: string): string {
  const amount = amountCents / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount)
  } catch {
    // Not every currency here is a real ISO code (USDC isn't) — Intl throws on those.
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}
