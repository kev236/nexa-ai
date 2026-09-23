'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BrainCircuit, Menu, Search, X } from 'lucide-react'
import { NAV_GROUPS, type NavKey } from '@/lib/navLinks'

// The phone-width nav — a real bottom tab bar + slide-up sheet, not the
// desktop sidebar squeezed into a strip (that's what .nav's own <=900px
// rules already did, and it's still what tablets get). Mounted as a
// sibling of .nav in Nav.tsx; CSS shows only one of the two per
// viewport width (see globals.css's <=760px block).
const PRIMARY_TAB_KEYS: NavKey[] = ['approvals', 'activity', 'chat', 'clips']

export function MobileNav({ active, status }: { active: NavKey; status?: { active: number; total: number } }) {
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    setSheetOpen(false)
  }, [active])

  useEffect(() => {
    if (!sheetOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [sheetOpen])

  const allLinks = NAV_GROUPS.flatMap((group) => group.links)
  const primaryLinks = PRIMARY_TAB_KEYS.map((key) => allLinks.find((link) => link.key === key)).filter(
    (link): link is NonNullable<typeof link> => Boolean(link)
  )
  const isInMore = !PRIMARY_TAB_KEYS.includes(active)

  function openCommandPalette() {
    setSheetOpen(false)
    window.dispatchEvent(new Event('nexa:open-command-palette'))
  }

  return (
    <>
      <div className="mobile-topbar">
        <span className="mobile-topbar-brand">
          <BrainCircuit size={18} className="nav-brand-icon" aria-hidden />
          Nexa AI
        </span>
        <button type="button" className="mobile-topbar-search" onClick={openCommandPalette} aria-label="Quick jump">
          <Search size={17} aria-hidden />
        </button>
      </div>

      <nav className="mobile-tabbar" aria-label="Primary">
        {primaryLinks.map(({ key, href, label, icon: Icon }) => (
          <Link key={key} href={href} className={active === key ? 'mobile-tab mobile-tab--active' : 'mobile-tab'}>
            <Icon size={20} aria-hidden />
            <span>{key === 'approvals' ? 'Home' : label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={isInMore ? 'mobile-tab mobile-tab--active' : 'mobile-tab'}
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          aria-haspopup="dialog"
        >
          <Menu size={20} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      {sheetOpen && (
        <div className="mobile-sheet-overlay" onClick={() => setSheetOpen(false)}>
          <div className="mobile-sheet" role="dialog" aria-modal="true" aria-label="All destinations" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-handle" aria-hidden />
            <div className="mobile-sheet-header">
              <span className="mobile-sheet-title">Menu</span>
              <button type="button" className="mobile-sheet-close" onClick={() => setSheetOpen(false)} aria-label="Close menu">
                <X size={17} aria-hidden />
              </button>
            </div>

            <button type="button" className="mobile-sheet-search" onClick={openCommandPalette}>
              <Search size={16} aria-hidden />
              <span>Quick jump</span>
              <kbd>⌘K</kbd>
            </button>

            <div className="mobile-sheet-groups">
              {NAV_GROUPS.map((group) => (
                <div className="mobile-sheet-group" key={group.label}>
                  <span className="mobile-sheet-group-label">{group.label}</span>
                  {group.links.map(({ key, href, label, icon: Icon }) => (
                    <Link
                      key={key}
                      href={href}
                      className={active === key ? 'mobile-sheet-link mobile-sheet-link--active' : 'mobile-sheet-link'}
                      onClick={() => setSheetOpen(false)}
                    >
                      <Icon size={18} aria-hidden />
                      <span>{label}</span>
                    </Link>
                  ))}
                </div>
              ))}
            </div>

            {status && (
              <div className="mobile-sheet-status">
                <span className="pulse-dot" aria-hidden />
                <span>
                  {status.active}/{status.total} agents online
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
