import Link from 'next/link'
import { BrainCircuit, LayoutDashboard, Activity, Wallet, Target, Megaphone, TrendingUp, Film, Sparkles, LogOut } from 'lucide-react'
import { logout } from '@/app/actions'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'

// Grouped by what each page is *for*, not alphabetically — matches how
// the owner actually uses the app: decide (Command), watch for signal
// (Intelligence), run the businesses (Operations). Every href here is a
// real page; nothing named after a feature that doesn't exist yet.
const NAV_GROUPS = [
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
] as const

type NavKey = (typeof NAV_GROUPS)[number]['links'][number]['key']

/**
 * The sidebar's own live readout — real agent counts for the primary
 * business (same nexa-labs default getBusiness() falls back to), not a
 * per-page number. Kept best-effort: a business/table that isn't set up
 * yet shouldn't take the whole sidebar down, same reasoning as the
 * Approvals HUD grid's loadCampaignCount().
 */
async function loadAgentStatus(): Promise<{ active: number; total: number } | undefined> {
  try {
    const business = await getBusiness()
    const agents = await getEngine().agentStore.listByBusiness(business.id)
    return { active: agents.filter((a) => a.active).length, total: agents.length }
  } catch {
    return undefined
  }
}

export async function Nav({ active }: { active: NavKey }) {
  const status = await loadAgentStatus()

  return (
    <nav className="nav">
      <div className="nav-brand">
        <BrainCircuit size={22} className="nav-brand-icon" aria-hidden />
        <span className="nav-brand-text">Nexa AI</span>
      </div>

      <div className="nav-links">
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.links.map(({ key, href, label, icon: Icon }) => (
              <Link key={key} href={href} className={active === key ? 'nav-link active' : 'nav-link'}>
                <Icon size={17} className="nav-link-icon" aria-hidden />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        ))}
      </div>

      {status && (
        <div className="nav-status">
          <span className="pulse-dot" aria-hidden />
          <span className="nav-status-text">
            [ {status.active}/{status.total} agents online ]
          </span>
        </div>
      )}

      <form action={logout} className="nav-signout-form">
        <button type="submit" className="nav-signout">
          <LogOut size={16} aria-hidden />
          <span>Sign out</span>
        </button>
      </form>
    </nav>
  )
}
