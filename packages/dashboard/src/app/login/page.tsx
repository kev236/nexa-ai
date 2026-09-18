'use client'

import { useActionState } from 'react'
import { BrainCircuit } from 'lucide-react'
import { login } from '@/app/actions'

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined)

  return (
    <form action={formAction} className="login-form deck-enter">
      <BrainCircuit size={28} className="login-form-icon" aria-hidden />
      <h1>Nexa AI</h1>
      <p className="subtitle">Sign in to review pending approvals.</p>
      <input name="email" type="email" placeholder="Email" required autoComplete="username" />
      <input name="password" type="password" placeholder="Password" required autoComplete="current-password" />
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
