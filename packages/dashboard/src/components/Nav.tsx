import Link from 'next/link'
import { logout } from '@/app/actions'

export function Nav({ active }: { active: 'approvals' | 'activity' | 'money' | 'opportunities' }) {
  return (
    <nav className="nav">
      <div className="nav-links">
        <Link href="/" className={active === 'approvals' ? 'nav-link active' : 'nav-link'}>
          Approvals
        </Link>
        <Link href="/activity" className={active === 'activity' ? 'nav-link active' : 'nav-link'}>
          Activity
        </Link>
        <Link href="/transactions" className={active === 'money' ? 'nav-link active' : 'nav-link'}>
          Money
        </Link>
        <Link href="/opportunities" className={active === 'opportunities' ? 'nav-link active' : 'nav-link'}>
          Opportunities
        </Link>
      </div>
      <form action={logout}>
        <button type="submit" className="nav-signout">
          Sign out
        </button>
      </form>
    </nav>
  )
}
