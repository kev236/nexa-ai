import { registerExecutor } from './registry.js'

/**
 * The only executor registered today. Real ones (send an email via Resend,
 * read a Stripe session, ...) arrive with the adapters in a later plan.
 * Its only job is to prove the approve -> execute path end to end without
 * anything that could touch a real business or spend real money.
 */
registerExecutor('noop', async (payload) => payload)
