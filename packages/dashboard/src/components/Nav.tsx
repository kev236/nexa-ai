import Link from 'next/link'
import { BrainCircuit, LayoutDashboard, Activity, Wallet, Target, Megaphone, Sparkles, LogOut } from 'lucide-react'
import { logout } from '@/app/actions'

const LINKS = [
  { key: 'approvals', href: '/', label: 'Approvals', icon: LayoutDashboard },
  { key: 'activity', href: '/activity', label: 'Activity', icon: Activity },
  { key: 'money', href: '/transactions', label: 'Money', icon: Wallet },
  { key: 'opportunities', href: '/opportunities', label: 'Opportunities', icon: Target },
  { key: 'campaigns', href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { key: 'story-concepts', href: '/story-concepts', label: 'Sproutlight', icon: Sparkles },
] as const

export function Nav({ active }: { active: (typeof LINKS)[number]['key'] }) {
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

      <form action={logout} className="nav-signout-form">
        <button type="submit" className="nav-signout">
          <LogOut size={16} aria-hidden />
          <span>Sign out</span>
        </button>
      </form>
    </nav>
  )
}
