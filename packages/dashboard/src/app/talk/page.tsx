import { readTrustedPersonSession } from '@/lib/trustedPersonSession'
import { TalkGate } from '@/components/TalkGate'
import { TalkConsole } from '@/components/TalkConsole'

export default async function TalkPage() {
  const session = await readTrustedPersonSession()

  if (!session) {
    return <TalkGate />
  }

  return <TalkConsole name={session.name} />
}
