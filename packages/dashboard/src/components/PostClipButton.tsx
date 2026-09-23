'use client'

import { useActionState } from 'react'
import type { PostClipState } from '@/app/clips/actions'

/**
 * Step 29: generalized to any platform, not just YouTube — Instagram
 * needs a public URL and can't accept a file (its publish API fetches
 * the video itself; see videoInput.ts's getPublicVideoUrl), so
 * urlOnly hides the file input for that one case rather than offering
 * a control that would silently do nothing.
 */
export function PostClipButton({
  action,
  platformLabel,
  urlOnly = false,
}: {
  action: (prevState: PostClipState, formData: FormData) => Promise<PostClipState>
  platformLabel: string
  urlOnly?: boolean
}) {
  const [state, formAction, pending] = useActionState<PostClipState, FormData>(action, undefined)

  if (state?.success) {
    return <p className="meta">Posted — refresh to see the link.</p>
  }

  return (
    <form action={formAction} className="clip-post-form">
      {!urlOnly && (
        <>
          <input name="videoFile" type="file" accept="video/*" aria-label="Video file to post" />
          <span className="clip-post-form-or">or</span>
        </>
      )}
      <input name="videoUrl" type="url" placeholder="https://.../clip.mp4" aria-label="Video URL to post" />
      <button type="submit" disabled={pending}>
        {pending ? 'Posting…' : `Post to ${platformLabel}`}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  )
}
