import { lookup } from 'node:dns/promises'
import type { JsonValue } from '../json.js'
import type { ExecutorFn } from './registry.js'
import { registerExecutor } from './registry.js'

/**
 * Real, minimal "read a web page" capability — the first slice of the
 * owner's "give Nexa AI real reach" ask, deliberately scoped to
 * read-only fetch-and-extract, not full browser automation (clicking,
 * filling forms, JS-rendered pages). That's a real, separate step: it
 * needs an actual approval-gate design decision for state-changing web
 * actions (this engine's only existing gate, expectedCost, means
 * "costs money" — it isn't a generic "needs approval" flag), not
 * something to bolt on by reusing a field for something it doesn't
 * mean. Read-only has no such problem: it's safe to auto-approve under
 * the existing gate, same as any other side-effect-free lookup.
 *
 * SSRF hardening here is deliberately stricter than videoInput.ts's
 * readVideoFromUrl (nexa-ai/packages/dashboard) even though both fetch
 * an arbitrary caller-supplied URL server-side: that one is owner-typed
 * (a human pastes a video URL they intend to post), this one is
 * agent-decided — an agent's own research task, potentially influenced
 * by content it already read (a classic prompt-injection path: a page
 * telling the agent to "now fetch http://169.254.169.254/..."). Blocks
 * private/reserved IP ranges, and re-validates every redirect hop
 * (redirect.manual + a small hop limit) rather than trusting fetch's
 * own automatic redirect following — a public-looking URL that
 * redirects to an internal one is the standard way around a naive
 * single-check guard.
 */

export type WebFetchClient = {
  fetchPage(url: string): Promise<{ status: number; contentType: string; body: string }>
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024 // 5MB — generous for real page text, not unbounded
const MAX_REDIRECTS = 5
const MAX_EXTRACTED_CHARS = 20_000 // keeps one page fetch from blowing up an agent's context

export function isPrivateOrReservedIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    // The regex above only matches with exactly 4 captured groups, so
    // these are never actually undefined — the ?? 0 is just to satisfy
    // strict indexed-access typing, not a real fallback path.
    const a = Number(v4[1] ?? 0)
    const b = Number(v4[2] ?? 0)
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // loopback
    if (a === 0) return true // "this network"
    if (a === 169 && b === 254) return true // link-local, incl. 169.254.169.254 cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 carrier-grade NAT
    return false
  }
  // IPv6 — normalize case for the prefix checks below.
  const v6 = ip.toLowerCase()
  if (v6 === '::1') return true // loopback
  if (v6.startsWith('fe80:') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')) return true // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true // unique local fc00::/7
  if (v6.startsWith('::ffff:')) {
    // IPv4-mapped IPv6 — re-check the embedded v4 address.
    const embedded = v6.slice('::ffff:'.length)
    return isPrivateOrReservedIp(embedded)
  }
  return false
}

async function assertPublicHostname(hostname: string): Promise<void> {
  let addresses: { address: string }[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    throw new Error(`Could not resolve host "${hostname}".`)
  }
  if (addresses.length === 0) throw new Error(`Host "${hostname}" resolved to no addresses.`)
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error(`Refusing to fetch "${hostname}" — resolves to a private/internal address.`)
    }
  }
}

async function assertSafeUrl(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed.')
  }
  await assertPublicHostname(url.hostname)
}

async function fetchWithValidatedRedirects(startUrl: string): Promise<Response> {
  let current = new URL(startUrl)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeUrl(current)
    const response = await fetch(current, { redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`Redirect (HTTP ${response.status}) had no Location header.`)
      current = new URL(location, current)
      continue
    }
    return response
  }
  throw new Error(`Too many redirects (over ${MAX_REDIRECTS}) following "${startUrl}".`)
}

async function readBodyWithCap(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error(`Response too large (${Math.round(contentLength / 1024 / 1024)}MB, limit 5MB).`)
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error('Response too large (limit 5MB).')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8')
}

export function createHttpWebFetchClient(): WebFetchClient {
  return {
    async fetchPage(url: string) {
      const response = await fetchWithValidatedRedirects(url)
      const contentType = response.headers.get('content-type') ?? ''
      const body = await readBodyWithCap(response)
      return { status: response.status, contentType, body }
    },
  }
}

/** Strips <script>/<style>, then tags, then collapses whitespace — not a real HTML parser, just enough to give an agent readable text instead of markup. */
function extractReadableText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch?.[1]?.trim() ?? ''

  const withoutNoise = html
    .replace(/<head[\s\S]*?<\/head>/i, ' ') // title is pulled separately above; the rest of <head> (meta, etc.) isn't body text either
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
  const withoutTags = withoutNoise.replace(/<[^>]+>/g, ' ')
  const decoded = withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  const text = decoded.replace(/\s+/g, ' ').trim().slice(0, MAX_EXTRACTED_CHARS)
  return { title, text }
}

type BrowseWebPayload = { url: string }

function assertBrowseWebPayload(payload: JsonValue): BrowseWebPayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload) || typeof payload.url !== 'string' || !payload.url.trim()) {
    throw new TypeError('browse_web payload must be { url }, a non-empty string')
  }
  return { url: payload.url.trim() }
}

export function createBrowseWebExecutor(client: WebFetchClient): ExecutorFn {
  return async (payload) => {
    const { url } = assertBrowseWebPayload(payload)

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error(`"${url}" is not a valid URL.`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http(s) URLs are allowed.')
    }

    const page = await client.fetchPage(url)
    if (page.status >= 400) {
      throw new Error(`Fetching "${url}" returned HTTP ${page.status}.`)
    }
    if (!page.contentType.includes('text/html') && !page.contentType.includes('text/plain')) {
      throw new Error(`"${url}" returned "${page.contentType || 'an unknown content type'}", not a readable page.`)
    }

    const { title, text } = page.contentType.includes('text/html')
      ? extractReadableText(page.body)
      : { title: '', text: page.body.trim().slice(0, MAX_EXTRACTED_CHARS) }

    if (!text) throw new Error(`"${url}" had no readable text content.`)

    return { url, title, text }
  }
}

/** Wires the real fetch-based client and registers 'browse_web'. Same not-run-on-import shape as every other executor here. */
export function registerBrowseWebExecutor(): void {
  registerExecutor('browse_web', createBrowseWebExecutor(createHttpWebFetchClient()))
}
