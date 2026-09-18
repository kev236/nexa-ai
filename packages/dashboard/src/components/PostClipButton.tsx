'use client'

import { useActionState } from 'react'
import type { PostClipState } from '@/app/clips/actions'

export function PostClipButton({
  action,
}: {
  action: (prevState: PostClipState, formData: FormData) => Promise<PostClipState>
}) {
  const [state, formAction, pending] = useActionState<PostClipState, FormData>(action, undefined)

  if (state?.success) {
    return <p className="meta">Posted — refresh to see the link.</p>
  }

  return (
    <form action={formAction} className="clip-post-form">
      <input name="videoFile" type="file" accept="video/*" aria-label="Video file to post" />
      <span className="clip-post-form-or">or</span>
      <input name="videoUrl" type="url" placeholder="https://.../clip.mp4" aria-label="Video URL to post" />
      <button type="submit" disabled={pending}>
        {pending ? 'Posting…' : 'Post to YouTube'}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  )
}
