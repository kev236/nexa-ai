import Link from 'next/link'
import { BrainCircuit } from 'lucide-react'
import { getEngine } from '@/lib/engine'
import { getBusiness } from '@/lib/business'
import { NAV_GROUPS, type NavKey } from '@/lib/navLinks'
import { CommandPalette } from '@/components/CommandPalette'
import { NexaWidget } from '@/components/NexaWidget'

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

      <CommandPalette />
      {active !== 'chat' && <NexaWidget />}
    </nav>
  )
}
