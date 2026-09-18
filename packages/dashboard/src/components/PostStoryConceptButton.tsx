'use client'

import { useActionState } from 'react'
import type { PostStoryConceptState } from '@/app/story-concepts/actions'

export function PostStoryConceptButton({
  action,
}: {
  action: (prevState: PostStoryConceptState, formData: FormData) => Promise<PostStoryConceptState>
}) {
  const [state, formAction, pending] = useActionState<PostStoryConceptState, FormData>(action, undefined)

  if (state?.success) {
    return <p className="meta">Posted — refresh to see the link.</p>
  }

  return (
    <form action={formAction} className="clip-post-form">
      <input name="videoFile" type="file" accept="video/*" aria-label="Video file to post" />
      <span className="clip-post-form-or">or</span>
      <input name="videoUrl" type="url" placeholder="https://.../video.mp4" aria-label="Video URL to post" />
      <button type="submit" disabled={pending}>
        {pending ? 'Posting…' : 'Post to YouTube'}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  )
}
