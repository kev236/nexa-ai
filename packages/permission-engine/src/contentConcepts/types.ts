/**
 * Step 16: one scored, fully-formed creative unit — a hook paired with
 * the script outline, CTA, caption, and visual note that go with it,
 * plus the six sub-scores from the "empire OS" doc's creative-scoring
 * section. Deliberately combined this way rather than the doc's
 * disjointed "20 hooks + 10 concepts + 5 scripts + 5 CTAs + 5 captions"
 * separate arrays — those don't say which hook pairs with which script,
 * so five independent lists would be strictly less useful than the same
 * ideas already paired. See creativeAgent.ts's prompt for the full
 * reasoning, and README.md's step 16 section.
 *
 * scriptOutline is a short beat-by-beat text description, not the full
 * scene-by-scene timeline JSON from the doc's section 9 — there is no
 * video renderer yet to consume scene timings, so producing them now
 * would be unused detail.
 */
export type ContentAngle =
  | 'educational'
  | 'curiosity'
  | 'problem_solution'
  | 'story'
  | 'controversial'
  | 'comparison'
  | 'demonstration'
  | 'transformation'
  | 'listicle'
  | 'personal_experience'

export type ContentConceptScore = {
  hook: number
  retention: number
  shareability: number
  clarity: number
  conversion: number
  offerFit: number
  /** Server-computed, never trusted from the model — see computeConceptScore(). */
  total: number
}

export type ContentConcept = {
  angle: ContentAngle
  hook: string
  scriptOutline: string
  cta: string
  caption: string
  visualConcept: string
  hashtags: string[]
  score: ContentConceptScore
  /** Set by the caller after scoring — the top concepts by total score, per the doc's "automatically select the strongest concepts." */
  recommended?: boolean
}

const SCORE_WEIGHTS: Record<Exclude<keyof ContentConceptScore, 'total'>, number> = {
  hook: 0.25,
  retention: 0.25,
  conversion: 0.2,
  shareability: 0.15,
  clarity: 0.1,
  offerFit: 0.05,
}

/**
 * The doc's own weighted formula (section 8), computed deterministically
 * from the model's six sub-scores rather than trusting an LLM-reported
 * total — "use deterministic code for calculations, use AI only where
 * reasoning/classification is valuable" (doc section 24).
 */
export function computeConceptScore(sub: Omit<ContentConceptScore, 'total'>): number {
  const total =
    sub.hook * SCORE_WEIGHTS.hook +
    sub.retention * SCORE_WEIGHTS.retention +
    sub.conversion * SCORE_WEIGHTS.conversion +
    sub.shareability * SCORE_WEIGHTS.shareability +
    sub.clarity * SCORE_WEIGHTS.clarity +
    sub.offerFit * SCORE_WEIGHTS.offerFit
  return Math.round(total)
}
