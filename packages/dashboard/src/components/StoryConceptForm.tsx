'use client'

import { useActionState } from 'react'
import { generateStoryConcept, type GenerateStoryConceptState } from '@/app/story-concepts/actions'

export function StoryConceptForm() {
  const [state, formAction, pending] = useActionState<GenerateStoryConceptState, FormData>(
    generateStoryConcept,
    undefined
  )

  return (
    <form action={formAction} className="opportunity-form">
      <label>
        Theme
        <input
          name="theme"
          type="text"
          placeholder="e.g. sharing with a friend, counting to five, a bedtime routine"
          required
        />
      </label>
      <label>
        Format
        <select name="format" defaultValue="song">
          <option value="song">Song (nursery rhyme)</option>
          <option value="story">Story (short narration)</option>
        </select>
      </label>

      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Generating…' : 'Generate concept'}
      </button>
    </form>
  )
}
