'use client'

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Send, Volume2, VolumeX } from 'lucide-react'
import { sendChatMessageAction } from '@/app/chat/actions'
import type { ChatMessage } from '@/lib/chat'

// Voice via the browser's built-in Web Speech API — no new API key, no
// new vendor, works today. SpeechRecognition for the mic button,
// SpeechSynthesis to read Nexa's replies aloud. Both are unavailable in
// some browsers (notably Firefox for recognition); the UI degrades to
// text-only rather than erroring when they're missing.
type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function ChatConsole() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: "I'm Nexa AI. Ask me about revenue, pending approvals, growth, or recent activity." },
  ])
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const speechSupported = typeof window !== 'undefined' && getSpeechRecognition() !== undefined
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function speak(text: string) {
    if (!voiceOn || !ttsSupported) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || pending) return
    setError(undefined)
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', text: trimmed }]
    setMessages(nextHistory)
    setInput('')
    setPending(true)
    const result = await sendChatMessageAction(nextHistory)
    setPending(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setMessages((prev) => [...prev, { role: 'assistant', text: result.reply }])
    speak(result.reply)
  }

  function toggleListening() {
    const Recognition = getSpeechRecognition()
    if (!Recognition) return

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript
      if (transcript) send(transcript)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

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
