import { verifySession } from '@/lib/dal'
import { Nav } from '@/components/Nav'
import { ChatConsole } from '@/components/ChatConsole'

export default async function ChatPage() {
  await verifySession()

  return (
    <>
      <Nav active="chat" />
      <div className="page-header">
        <h1>Chat</h1>
        <p className="subtitle">
          Talk to Nexa AI directly — by text or voice. It answers from real data (revenue, approvals, growth,
          activity); it doesn&apos;t post, approve, or spend from here.
        </p>
      </div>

      <div className="deck-enter">
        <ChatConsole />
      </div>
    </>
  )
}
