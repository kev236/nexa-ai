'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { COMMAND_ITEMS } from '@/lib/navLinks'

/**
 * Global quick-nav, mounted once inside Nav.tsx so it's on every
 * authenticated page. Ctrl/Cmd+K (or the sidebar hint button) opens it;
 * every result is a real page this app already has — see navLinks.ts.
 *
 * The overlay renders through a portal into document.body, not in
 * place — `.nav` (this component's parent) has `backdrop-filter`,
 * which per spec creates a new containing block for `position: fixed`
 * descendants. Left in place, the "fixed, full-viewport" overlay was
 * actually being sized and positioned relative to the 232px sidebar
 * box instead of the viewport, breaking it almost entirely.
 */
export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [mounted, setMounted] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const items = q ? COMMAND_ITEMS.filter((item) => item.label.toLowerCase().includes(q)) : COMMAND_ITEMS
    const groups = new Map<string, typeof items>()
    for (const item of items) {
      const bucket = groups.get(item.group)
      if (bucket) bucket.push(item)
      else groups.set(item.group, [item])
    }
    return { flat: items, groups: Array.from(groups.entries()) }
  }, [query])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
        return
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function navigateTo(href: string) {
    setOpen(false)
    router.push(href)
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = results.flat[activeIndex]
      if (target) navigateTo(target.href)
    }
  }

  return (
    <>
      <button
        type="button"
        className="nav-command-hint"
        onClick={() => setOpen(true)}
        aria-label="Open quick jump (Ctrl+K)"
      >
        <span>Quick jump</span>
        <kbd>⌘K</kbd>
      </button>

      {open &&
        mounted &&
        createPortal(
          <div className="command-palette-overlay" onClick={() => setOpen(false)}>
          <div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Quick jump"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-palette-input-row">
              <Search size={16} aria-hidden />
              <input
                ref={inputRef}
                className="command-palette-input"
                type="text"
                placeholder="Jump to a page or action…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                aria-label="Search pages and actions"
              />
              <span className="command-palette-kbd">esc</span>
            </div>

            <div className="command-palette-list">
              {results.flat.length === 0 ? (
                <p className="command-palette-empty">No matches for &ldquo;{query}&rdquo;.</p>
              ) : (
                results.groups.map(([group, items]) => (
                  <div key={group}>
                    <p className="command-palette-group-label">{group}</p>
                    {items.map((item) => {
                      const index = results.flat.indexOf(item)
                      const Icon = item.icon
                      return (
                        <button
                          type="button"
                          key={item.href}
                          className="command-palette-item"
                          data-active={index === activeIndex}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => navigateTo(item.href)}
                        >
                          <Icon size={16} aria-hidden />
                          <span>{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="command-palette-footer">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc close</span>
            </div>
          </div>
        </div>,
          document.body
        )}
    </>
  )
}
