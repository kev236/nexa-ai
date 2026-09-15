import type { JsonValue } from '../json.js'

export type SpendingLimitConfig = {
  amountCents: number
  currency: string
  windowHours: number
}

/**
 * Step 13: businesses.config.spendingLimitCents / spendingLimitCurrency /
 * spendingLimitWindowHours (set via db:set-business-config, same generic
 * shallow-merge every other business config key already uses — no new
 * script). All three must be present and well-formed together; any one
 * missing or malformed means "no cap configured," never a crash — fail
 * closed (readme.md invariant #8) lands on the *safer* side here because
 * an unconfigured cap simply doesn't constrain auto-approval, it doesn't
 * silently allow an unbounded one either (see engine.ts's shouldAutoApprove:
 * autonomy level 2 still requires its own explicit opt-in).
 */
export function readSpendingLimitConfig(config: JsonValue): SpendingLimitConfig | undefined {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return undefined
  const { spendingLimitCents, spendingLimitCurrency, spendingLimitWindowHours } = config as Record<string, unknown>
  if (
    typeof spendingLimitCents !== 'number' ||
    !Number.isFinite(spendingLimitCents) ||
    spendingLimitCents < 0 ||
    typeof spendingLimitCurrency !== 'string' ||
    spendingLimitCurrency.length === 0 ||
    typeof spendingLimitWindowHours !== 'number' ||
    !Number.isFinite(spendingLimitWindowHours) ||
    spendingLimitWindowHours <= 0
  ) {
    return undefined
  }
  return { amountCents: spendingLimitCents, currency: spendingLimitCurrency, windowHours: spendingLimitWindowHours }
}
