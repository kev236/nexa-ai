import { UserCheck } from 'lucide-react'
import { verifySession } from '@/lib/dal'
import { getTrustedPeopleStore } from '@/lib/engine'
import { relativeTime } from '@/lib/format'
import { Nav } from '@/components/Nav'
import { EmptyState } from '@/components/EmptyState'
import { AddTrustedPersonForm } from '@/components/AddTrustedPersonForm'
import { revokeTrustedPersonAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * The owner's "recognize known people, reject strangers" ask, answered
 * without collecting anyone's biometrics (see migration 0026's own
 * comment for the real reason: enrolling a real person's voice or face
 * without their own consent is GDPR special-category data in the
 * Netherlands/EU). A trusted person is recognized by a PIN they hold —
 * the owner adds them here, tells them the PIN directly, and can revoke
 * it any time. Anyone not on this list is denied by default wherever
 * this list gates access — no attempt at "threat detection" behavior,
 * deny-by-default already does the actual job.
 */
export default async function TrustedPeoplePage() {
  await verifySession()
  const people = await getTrustedPeopleStore().listAll()

  return (
    <>
      <Nav active="trusted-people" />
      <div className="page-header">
        <h1>Trusted People</h1>
        <p className="subtitle">
          Who else can talk to Nexa AI — recognized by a PIN they hold, not their voice or face. Anyone not on this
          list gets a polite refusal, nothing more.
        </p>
      </div>

      <div className="deck-enter">
        <AddTrustedPersonForm />
      </div>

      {people.length === 0 ? (
        <EmptyState icon={UserCheck} title="No one added yet — it's just you" />
      ) : (
        <div className="deck-enter" style={{ animationDelay: '0.1s', marginTop: '1.5rem' }}>
          {people.map((person) => (
            <div className="card" key={person.id}>
              <div className="card-header">
                <span className="action-type-row">
                  <span className="concept-title">{person.name}</span>
                  <span className={person.revokedAt ? 'status-badge status-denied' : 'status-badge status-active'}>
                    {person.revokedAt ? 'revoked' : 'active'}
                  </span>
                </span>
                <span className="meta mono">id: {person.id.slice(0, 8)}</span>
              </div>
              <p className="meta">
                {person.lastUsedAt ? `last talked to Nexa ${relativeTime(person.lastUsedAt)}` : 'never talked to Nexa yet'} ·
                added {relativeTime(person.createdAt)}
              </p>
              {!person.revokedAt && (
                <form action={revokeTrustedPersonAction.bind(null, person.id)}>
                  <button type="submit" className="deny">
                    Revoke
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
