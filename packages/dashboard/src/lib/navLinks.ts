import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Activity,
  Wallet,
  Target,
  Megaphone,
  TrendingUp,
  Film,
  Sparkles,
  PlusCircle,
} from 'lucide-react'

// Shared between Nav.tsx (a server component) and CommandPalette.tsx (a
// client component) — pure data, no server-only imports, so it's safe to
// pull into the client bundle without dragging getEngine()/getBusiness()
// along with it.

export type NavKey =
  | 'approvals'
  | 'activity'
  | 'opportunities'
  | 'growth'
  | 'story-concepts'
  | 'money'
  | 'campaigns'
  | 'clips'

type NavLink = { key: NavKey; href: string; label: string; icon: LucideIcon }

// Grouped by what each page is *for*, not alphabetically — matches how
// the owner actually uses the app: decide (Command), watch for signal
// (Intelligence), run the businesses (Operations). Every href here is a
// real page; nothing named after a feature that doesn't exist yet.
export const NAV_GROUPS: { label: string; links: NavLink[] }[] = [
  {
    label: 'Command',
    links: [
      { key: 'approvals', href: '/', label: 'Command Center', icon: LayoutDashboard },
      { key: 'activity', href: '/activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    label: 'Intelligence',
    links: [
      { key: 'opportunities', href: '/opportunities', label: 'Opportunities', icon: Target },
      { key: 'growth', href: '/growth', label: 'Growth', icon: TrendingUp },
      { key: 'story-concepts', href: '/story-concepts', label: 'Sproutlight', icon: Sparkles },
    ],
  },
  {
    label: 'Operations',
    links: [
      { key: 'money', href: '/transactions', label: 'Money', icon: Wallet },
      { key: 'campaigns', href: '/campaigns', label: 'Campaigns', icon: Megaphone },
      { key: 'clips', href: '/clips', label: 'Clips', icon: Film },
    ],
  },
]

export type CommandItem = { href: string; label: string; icon: LucideIcon; group: string }

// The Command Palette's full result set — every real nav destination,
// plus real create-flow pages (not fabricated shortcuts) grouped
// separately so "new opportunity" doesn't get lost among page jumps.
export const COMMAND_ITEMS: CommandItem[] = [
  ...NAV_GROUPS.flatMap((group) => group.links.map((link) => ({ href: link.href, label: link.label, icon: link.icon, group: group.label }))),
  { href: '/opportunities/new', label: 'New opportunity', icon: PlusCircle, group: 'Quick actions' },
  { href: '/campaigns/new', label: 'New campaign', icon: PlusCircle, group: 'Quick actions' },
]
