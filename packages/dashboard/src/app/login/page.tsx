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
      <label htmlFor="login-email" className="visually-hidden">
        Email
      </label>
      <input id="login-email" name="email" type="email" placeholder="Email" required autoComplete="username" />
      <label htmlFor="login-password" className="visually-hidden">
        Password
      </label>
      <input
        id="login-password"
        name="password"
        type="password"
        placeholder="Password"
        required
        autoComplete="current-password"
      />
      {state?.error && <p className="error">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
