'use client'

import { useCallback, useRef, useState } from 'react'
import { sendChatMessageAction } from '@/app/chat/actions'
import type { ChatMessage } from '@/lib/chat'

// Voice via the browser's built-in Web Speech API — no new API key, no
// new vendor. Shared by the full /chat page and the floating quick-access
// widget so both talk to Nexa AI through the exact same state machine
// instead of drifting apart.
export type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function useNexaChat(greeting: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: greeting }])
  const [pending, setPending] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceOn, setVoiceOn] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const speechSupported = typeof window !== 'undefined' && getSpeechRecognition() !== undefined
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Always resolves — callers that don't care how the utterance ends
  // (the normal "reply arrived, say it" path) just don't await it.
  const speak = useCallback(
    (text: string): Promise<void> => {
      if (!voiceOn || !ttsSupported) return Promise.resolve()
      return new Promise((resolve) => {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.onend = () => resolve()
        utterance.onerror = () => resolve()
        window.speechSynthesis.speak(utterance)
      })
    },
    [voiceOn, ttsSupported]
  )

  const send = useCallback(
    async (text: string): Promise<string | undefined> => {
      const trimmed = text.trim()
      if (!trimmed || pending) return undefined
      setError(undefined)
      const nextHistory: ChatMessage[] = [...messagesRef.current, { role: 'user', text: trimmed }]
      setMessages(nextHistory)
      setPending(true)
      const result = await sendChatMessageAction(nextHistory)
      setPending(false)
      if ('error' in result) {
        setError(result.error)
        return undefined
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: result.reply }])
      speak(result.reply)
      return result.reply
    },
    [pending, speak]
  )

  // One-shot capture resolved as a promise, so a caller (the wake-word
  // flow) can chain "listen, then act" without threading a callback
  // through the recognition's own event handlers.
  const listenOnce = useCallback((): Promise<string | undefined> => {
    const Recognition = getSpeechRecognition()
    if (!Recognition) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const recognition = new Recognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'
      recognition.onresult = (event) => resolve(event.results[0]?.[0]?.transcript)
      recognition.onerror = () => resolve(undefined)
      recognition.onend = () => setListening(false)
      recognitionRef.current = recognition
      recognition.start()
      setListening(true)
    })
  }, [])

  const toggleListening = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    listenOnce().then((transcript) => {
      if (transcript) send(transcript)
    })
  }, [listening, listenOnce, send])

  return {
    messages,
    pending,
    error,
    voiceOn,
    setVoiceOn,
    listening,
    speechSupported,
    ttsSupported,
    send,
    speak,
    listenOnce,
    toggleListening,
  }
}
