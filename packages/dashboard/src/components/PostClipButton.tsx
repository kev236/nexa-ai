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
      <input name="videoFile" type="file" accept="video/*" required aria-label="Video file to post" />
      <button type="submit" disabled={pending}>
        {pending ? 'Posting…' : 'Post to YouTube'}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  )
}
