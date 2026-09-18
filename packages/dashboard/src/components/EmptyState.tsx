import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The shared "nothing here yet" treatment — swaps the old bare
 * <p className="empty"> text for an icon + real guidance (what command
 * to run, or what's still missing), consistent across every page.
 * tone="approve" is for the genuinely good kind of empty (nothing
 * pending your review) — same shape, green instead of accent purple.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  tone = 'accent',
}: {
  icon: LucideIcon
  title: string
  hint?: ReactNode
  tone?: 'accent' | 'approve'
}) {
  return (
    <div className={`empty-state deck-enter${tone === 'approve' ? ' empty-state--approve' : ''}`}>
      <span className="empty-state-icon" aria-hidden>
        <Icon size={26} />
      </span>
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
    </div>
  )
}
