import { verifySession } from '@/lib/dal'
import { Nav } from '@/components/Nav'
import { ProposeBrowserActionForm } from '@/components/ProposeBrowserActionForm'

export const dynamic = 'force-dynamic'

/**
 * The plan-then-approve-then-execute flow's submission side. There's no
 * autonomous planning agent yet that reads a page and decides what to
 * click — that's real, separate work, and it needs a working Claude API
 * key to run at all — so for now this is you telling it exactly what
 * you want done, reviewing it, and approving it, same as everything
 * else that isn't auto-approved.
 */
export default async function BrowserActionsPage() {
  await verifySession()

  return (
    <>
      <Nav active="browser-actions" />
      <div className="page-header">
        <h1>Browser Actions</h1>
        <p className="subtitle">
          Propose one specific action on a page — a click, filling a field, checking a box. Nothing runs until you
          approve it from the Home page, where you&apos;ll see exactly what was proposed.
        </p>
      </div>

      <div className="deck-enter">
        <ProposeBrowserActionForm />
      </div>
    </>
  )
}
