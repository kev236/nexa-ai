export function formatAmount(amountCents: number, currency: string): string {
  const amount = amountCents / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount)
  } catch {
    // Not every currency here is a real ISO code (USDC isn't) — Intl throws on those.
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}
