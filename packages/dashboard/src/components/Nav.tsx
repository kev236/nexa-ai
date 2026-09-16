import Link from 'next/link'
import { BrainCircuit, LayoutDashboard, Activity, Wallet, Target, Megaphone, TrendingUp, Sparkles, LogOut } from 'lucide-react'
import { logout } from '@/app/actions'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'

const LINKS = [
  { key: 'approvals', href: '/', label: 'Approvals', icon: LayoutDashboard },
  { key: 'activity', href: '/activity', label: 'Activity', icon: Activity },
  { key: 'money', href: '/transactions', label: 'Money', icon: Wallet },
  { key: 'opportunities', href: '/opportunities', label: 'Opportunities', icon: Target },
  { key: 'campaigns', href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { key: 'growth', href: '/growth', label: 'Growth', icon: TrendingUp },
  { key: 'story-concepts', href: '/story-concepts', label: 'Sproutlight', icon: Sparkles },
] as const

/**
 * The sidebar's own live readout — real agent counts for the primary
 * business (same nexa-labs default getBusiness() falls back to), not a
 * per-page number. Kept best-effort: a business/table that isn't set up
 * yet shouldn't take the whole sidebar down, same reasoning as the
 * Approvals bento grid's loadCampaignCount().
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

export async function Nav({ active }: { active: (typeof LINKS)[number]['key'] }) {
  const status = await loadAgentStatus()

  return (
    <nav className="nav">
      <div className="nav-brand">
        <BrainCircuit size={22} className="nav-brand-icon" aria-hidden />
        <span className="nav-brand-text">Nexa AI</span>
      </div>

      <div className="nav-links">
        {LINKS.map(({ key, href, label, icon: Icon }) => (
          <Link key={key} href={href} className={active === key ? 'nav-link active' : 'nav-link'}>
            <Icon size={17} className="nav-link-icon" aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </div>

      {status && (
        <div className="nav-status">
          <span className="pulse-dot" aria-hidden />
          <span className="nav-status-text">
            {status.active}/{status.total} agents online
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
