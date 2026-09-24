'use client'

import { useActionState } from 'react'
import { BrainCircuit } from 'lucide-react'
import { verifyTrustedPersonAction, type VerifyTrustedPersonState } from '@/app/talk/actions'

export function TalkGate() {
  const [state, formAction, pending] = useActionState<VerifyTrustedPersonState, FormData>(
    verifyTrustedPersonAction,
    undefined
  )

  return (
    <form action={formAction} className="login-form deck-enter">
      <BrainCircuit size={28} className="login-form-icon" aria-hidden />
      <h1>Nexa AI</h1>
      <p className="subtitle">The owner added you as someone Nexa can talk to. Enter your name and PIN.</p>
      <label htmlFor="talk-name" className="visually-hidden">
        Name
      </label>
      <input id="talk-name" name="name" type="text" placeholder="Your name" required autoComplete="name" />
      <label htmlFor="talk-pin" className="visually-hidden">
        PIN
      </label>
      <input
        id="talk-pin"
        name="pin"
        type="password"
        inputMode="numeric"
        placeholder="PIN"
        required
        autoComplete="off"
      />
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Checking…' : 'Talk to Nexa'}
      </button>
    </form>
  )
}
