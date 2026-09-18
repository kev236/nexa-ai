import { renderAppIcon } from '@/lib/appIcon'

// Serves the sizes manifest.ts asks for (192/512, per PWA install
// requirements) at fixed, known URLs. Kept separate from icon.tsx /
// apple-icon.tsx — those are Next's special metadata-file convention
// bound to the app root segment, not routes we can link to by URL.
const ALLOWED_SIZES = [192, 512]

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params
  const requested = Number(size)
  const px = ALLOWED_SIZES.includes(requested) ? requested : 192
  return renderAppIcon(px)
}
