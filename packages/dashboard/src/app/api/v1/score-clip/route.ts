import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { evaluateClip, createAnthropicClient } from '@nexa-ai/permission-engine'
import { getApiKeyStore } from '@/lib/engine'

/**
 * Step 30: the clip-scoring API product's one endpoint — wraps the same
 * evaluateClip() TrendRush's own /clips page uses internally
 * (agents/clipDiscoveryAgent.ts), for external callers who authenticate
 * with an api_keys row instead of a dashboard session. Read-only: no
 * requestAction(), no database write beyond this key's own usage
 * counter — evaluateClip() itself has no side effects, same reasoning
 * discoverClipOnce()'s doc comment gives for why TrendRush's own
 * evaluation step doesn't go through approvals either.
 *
 * Billing is manual for now (the owner issues a key after being paid
 * outside this system) — no Stripe wiring here. That's a deliberate,
 * separate step, not an oversight.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined
  if (!providedKey) {
    return NextResponse.json({ error: 'Missing Authorization: Bearer <key> header.' }, { status: 401 })
  }

  const apiKeyStore = getApiKeyStore()
  const key = await apiKeyStore.findActiveByPlaintextKey(providedKey)
  if (!key) {
    return NextResponse.json({ error: 'Invalid or revoked API key.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 })
  }
  const { sourceDescription, sourceUrl } = body as Record<string, unknown>
  if (typeof sourceDescription !== 'string' || !sourceDescription.trim()) {
    return NextResponse.json({ error: '"sourceDescription" is required: what happens in the clip, who it features.' }, { status: 400 })
  }
  if (sourceUrl !== undefined && typeof sourceUrl !== 'string') {
    return NextResponse.json({ error: '"sourceUrl", if given, must be a string.' }, { status: 400 })
  }

  try {
    const client = createAnthropicClient()
    const result = await evaluateClip(client, sourceDescription.trim(), sourceUrl?.trim() || undefined)
    await apiKeyStore.recordUsage(key.id)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scoring failed.' },
      { status: 502 }
    )
  }
}
