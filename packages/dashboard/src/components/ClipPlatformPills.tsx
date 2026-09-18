'use client'

import { useState } from 'react'
import { PostClipButton } from '@/components/PostClipButton'
import type { PostClipState } from '@/app/clips/actions'

type PlatformState =
  | { kind: 'posted'; label: string; href?: string }
  | { kind: 'postable'; action: (prevState: PostClipState, formData: FormData) => Promise<PostClipState>; urlOnly?: boolean }
  | { kind: 'connect'; href: string }

type Platform = { key: string; label: string; state: PlatformState }

/**
 * One pill per platform instead of three always-stacked blocks (see
 * globals.css's own comment on .clip-platform-pills) — a clip
 * connected to all three no longer triples its own card height to
 * show the same three states over and over. Clicking a postable pill
 * expands that platform's own attach-video form inline, one at a
 * time; clicking it again (or another pill) collapses it.
 */
export function ClipPlatformPills({ platforms }: { platforms: Platform[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div>
      <div className="clip-platform-pills">
        {platforms.map((platform) => {
          if (platform.state.kind === 'posted') {
            return platform.state.href ? (
              <a
                key={platform.key}
                href={platform.state.href}
                target="_blank"
                rel="noreferrer"
                className="clip-platform-pill clip-platform-pill--posted"
              >
                {platform.label}: posted
              </a>
            ) : (
              <span key={platform.key} className="clip-platform-pill clip-platform-pill--posted">
                {platform.label}: posted
              </span>
            )
          }
          if (platform.state.kind === 'connect') {
            return (
              <a key={platform.key} href={platform.state.href} className="clip-platform-pill clip-platform-pill--connect">
                {platform.label}: connect
              </a>
            )
          }
          const isExpanded = expanded === platform.key
          return (
            <button
              key={platform.key}
              type="button"
              className="clip-platform-pill clip-platform-pill--postable"
              aria-expanded={isExpanded}
              onClick={() => setExpanded(isExpanded ? null : platform.key)}
            >
              {platform.label}: {isExpanded ? 'close' : 'post'}
            </button>
          )
        })}
      </div>

      {platforms.map((platform) =>
        platform.state.kind === 'postable' && expanded === platform.key ? (
          <PostClipButton
            key={platform.key}
            action={platform.state.action}
            platformLabel={platform.label}
            urlOnly={platform.state.urlOnly}
          />
        ) : null
      )}
    </div>
  )
}
