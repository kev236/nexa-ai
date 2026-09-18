import 'server-only'

// Shared by clips/actions.ts and story-concepts/actions.ts — both post
// a real video the owner attaches, either as a file upload or a pasted
// URL. Kept in one place deliberately: this is the code that enforces
// the 200MB cap on a fetched URL, and having two copies is exactly how
// a fix to one (see readVideoFromUrl's streaming rewrite) stops
// covering the other.

/** Absent/empty file inputs still show up in FormData as a zero-size File — treated the same as "no file attached". */
async function readVideoFile(formData: FormData, field: string): Promise<{ bytes: Buffer; mimeType: string } | undefined> {
  const file = formData.get(field)
  if (!(file instanceof File) || file.size === 0) return undefined
  return { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type || 'video/mp4' }
}

// A video hosted somewhere else (an OpenArt generation result, for
// instance) doesn't need to round-trip through the owner's device —
// this fetch runs on the server (Vercel), not a sandboxed dev
// environment, so it can reach hosts a local/sandboxed session can't.
// Owner-only surface (verifySession() gates both callers), so this
// intentionally doesn't block private/internal IP ranges the way a
// public-facing fetch-a-URL endpoint would have to.
const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200MB — generous for a short-form clip, not unbounded

async function readVideoFromUrl(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('That video URL is not valid.')
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Video URL must be http(s).')
  }

  const response = await fetch(parsed)
  if (!response.ok) {
    throw new Error(`Could not fetch that video URL: HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? 'video/mp4'
  if (!contentType.startsWith('video/')) {
    throw new Error(`That URL didn't return a video (got "${contentType}").`)
  }
  // Fast-path rejection when the host reports its size honestly — but
  // content-length can be absent (chunked transfer) or wrong, so it's
  // never the only guard: the stream below enforces the real cap as
  // bytes arrive, instead of buffering an unbounded body into memory
  // and only checking afterward.
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > MAX_VIDEO_BYTES) {
    throw new Error(`Video is too large (${Math.round(contentLength / 1024 / 1024)}MB, limit 200MB).`)
  }
  if (!response.body) {
    throw new Error('Video fetch returned no body.')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_VIDEO_BYTES) {
      await reader.cancel()
      throw new Error('Video is too large (limit 200MB).')
    }
    chunks.push(value)
  }
  return { bytes: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))), mimeType: contentType }
}

/** Prefers an uploaded file; falls back to fetching a pasted URL server-side. */
export async function resolveVideoInput(
  formData: FormData,
  fileField: string,
  urlField: string
): Promise<{ bytes: Buffer; mimeType: string } | undefined> {
  const file = await readVideoFile(formData, fileField)
  if (file) return file

  const url = formData.get(urlField)
  if (typeof url === 'string' && url.trim()) {
    return readVideoFromUrl(url.trim())
  }
  return undefined
}

/**
 * Instagram's publish API needs a URL its own servers can fetch, never
 * raw bytes (postClipInstagram.ts's own comment has the detail) — so
 * unlike resolveVideoInput above, an uploaded file is useless here even
 * though it's the preferred source for YouTube/TikTok. Returns the
 * pasted URL only when that's genuinely what was given (no file
 * attached), same http(s) validation as readVideoFromUrl but without
 * fetching the bytes — Instagram fetches it itself.
 */
export function getPublicVideoUrl(formData: FormData, fileField: string, urlField: string): string | undefined {
  const file = formData.get(fileField)
  if (file instanceof File && file.size > 0) return undefined

  const url = formData.get(urlField)
  if (typeof url !== 'string' || !url.trim()) return undefined
  try {
    const parsed = new URL(url.trim())
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined
    return url.trim()
  } catch {
    return undefined
  }
}
