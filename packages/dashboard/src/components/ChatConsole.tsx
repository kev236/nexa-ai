'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react'
import { useNexaChat } from '@/components/useNexaChat'
import { sendChatMessageAction } from '@/app/chat/actions'

export function ChatConsole() {
  const {
    messages,
    pending,
    error,
    voiceOn,
    setVoiceOn,
    listening,
    speechSupported,
    ttsSupported,
    send,
    toggleListening,
  } = useNexaChat(
    "I'm Nexa AI. Ask me about revenue, pending approvals, growth, or recent activity.",
    sendChatMessageAction
  )
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  return (
    <div className="chat-console">
      <div className="chat-console-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.text}
          </div>
        ))}
        {pending && <div className="chat-bubble chat-bubble--assistant chat-bubble--pending">Thinking…</div>}
      </div>

      {error && <p className="error">{error}</p>}

      <form
        className="chat-console-input-row"
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
          setInput('')
        }}
      >
        {speechSupported && (
          <button
            type="button"
            className={listening ? 'chat-mic-button chat-mic-button--active' : 'chat-mic-button'}
            onClick={toggleListening}
            aria-label={listening ? 'Stop listening' : 'Speak to Nexa AI'}
            aria-pressed={listening}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Nexa AI…"
          aria-label="Message"
        />
        {ttsSupported && (
          <button
            type="button"
            className={voiceOn ? 'chat-mic-button chat-mic-button--active' : 'chat-mic-button'}
            onClick={() => setVoiceOn((v) => !v)}
            aria-label={voiceOn ? 'Turn off spoken replies' : 'Turn on spoken replies'}
            aria-pressed={voiceOn}
          >
            {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        )}
        <button type="submit" disabled={pending || !input.trim()} aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
