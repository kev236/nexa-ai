/**
 * The 12-dimension opportunity-scoring rubric from the owner's "empire
 * OS" vision doc (section 8), scoped down to a manual scoring tool — the
 * owner fills these in themselves, nothing here is populated by an
 * agent. Every dimension is on the same 0-100 "how favorable is this for
 * the opportunity" scale, not a literal raw metric — so a high
 * Competition score means *little* competitive pressure (favorable), not
 * a high literal amount of competition, and a high Startup Cost score
 * means the cost is *low* (favorable). Putting every dimension on one
 * consistent "higher is better" scale is what makes a plain average
 * across all 12 a coherent total score — see computeTotalScore() below.
 * The dashboard's form labels each field with its favorable direction so
 * the owner enters comparable numbers.
 */
export type OpportunityScores = {
  marketDemand: number
  competition: number
  customerPain: number
  revenuePotential: number
  profitPotential: number
  startupCost: number
  developmentDifficulty: number
  timeToMarket: number
  scalability: number
  automationPotential: number
  recurringRevenuePotential: number
  longTermPotential: number
}

export const SCORE_DIMENSIONS: {
  key: keyof OpportunityScores
  label: string
  favorableHint: string
}[] = [
  { key: 'marketDemand', label: 'Market demand', favorableHint: 'higher = more demand' },
  { key: 'competition', label: 'Competition', favorableHint: 'higher = less competitive pressure' },
  { key: 'customerPain', label: 'Customer pain', favorableHint: 'higher = more acute pain' },
  { key: 'revenuePotential', label: 'Revenue potential', favorableHint: 'higher = larger potential revenue' },
  { key: 'profitPotential', label: 'Profit potential', favorableHint: 'higher = better margins' },
  { key: 'startupCost', label: 'Startup cost', favorableHint: 'higher = lower cost to start' },
  { key: 'developmentDifficulty', label: 'Development difficulty', favorableHint: 'higher = easier to build' },
  { key: 'timeToMarket', label: 'Time to market', favorableHint: 'higher = faster to launch' },
  { key: 'scalability', label: 'Scalability', favorableHint: 'higher = scales more easily' },
  { key: 'automationPotential', label: 'Automation potential', favorableHint: 'higher = more automatable' },
  { key: 'recurringRevenuePotential', label: 'Recurring revenue potential', favorableHint: 'higher = more recurring' },
  { key: 'longTermPotential', label: 'Long-term potential', favorableHint: 'higher = better long-term outlook' },
]

/**
 * Every dimension present, a finite number 0-100. Thrown, never
 * silently clamped or defaulted — a malformed score is a bug in the
 * caller (the form), not something to paper over.
 */
export function assertOpportunityScores(value: unknown): asserts value is OpportunityScores {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('scores must be an object')
  }
  const record = value as Record<string, unknown>
  for (const { key, label } of SCORE_DIMENSIONS) {
    const score = record[key]
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new TypeError(`${label} (${key}) must be a finite number between 0 and 100`)
    }
  }
}

/** A plain average of the 12 dimensions, rounded. No invented weights — the doc gives none, and fabricating a weighting scheme would be presenting a guess as a formula. */
export function computeTotalScore(scores: OpportunityScores): number {
  const total = SCORE_DIMENSIONS.reduce((sum, { key }) => sum + scores[key], 0)
  return Math.round(total / SCORE_DIMENSIONS.length)
}
