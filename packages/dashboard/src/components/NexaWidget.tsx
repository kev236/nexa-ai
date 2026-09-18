'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrainCircuit, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react'
import { getSpeechRecognition, useNexaChat, type SpeechRecognitionLike } from '@/components/useNexaChat'

// Floating quick-access console — mounted once in Nav so it's on every
// page, not just /chat. Two ways in: click the button, or (once voice
// mode is on) just say "hello Nexa" / "hi Nexa" from anywhere.
//
// Renders through a portal into document.body, not in place — same
// reason as CommandPalette (see its own comment): `.nav`, this
// component's parent, has `backdrop-filter`, which creates a new
// containing block for `position: fixed` descendants. Left in place,
// the fab/panel would be pinned to the 232px sidebar box instead of
// the viewport.
const WAKE_PHRASES = ['hello nexa', 'hi nexa', 'hey nexa']
const VOICE_MODE_KEY = 'nexa-voice-mode'
const MAX_CONSECUTIVE_FAILURES = 4

function containsWakePhrase(transcript: string): boolean {
  const lower = transcript.toLowerCase()
  return WAKE_PHRASES.some((phrase) => lower.includes(phrase))
}

export function NexaWidget() {
  const { messages, pending, error, voiceOn, setVoiceOn, listening, speechSupported, ttsSupported, send, speak, listenOnce, toggleListening } =
    useNexaChat('Hey, I\'m Nexa AI. Say "hello Nexa" or tap the mic anytime.')
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [wakeArmed, setWakeArmed] = useState(false)
  const [micError, setMicError] = useState<string | undefined>()
  const [mounted, setMounted] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const voiceOnRef = useRef(voiceOn)
  const busyRef = useRef(false)
  const failureRef = useRef(0)
  const wakeRecognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const handleWakeRef = useRef<() => void>(() => {})

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    try {
      if (speechSupported && localStorage.getItem(VOICE_MODE_KEY) === 'true') {
        setVoiceOn(true)
      }
    } catch {
      // Private browsing / blocked storage — voice mode just starts off.
    }
    // Only ever meant to run once, on mount.
  }, [])

  const stopWakeListening = useCallback(() => {
    wakeRecognitionRef.current?.stop()
    wakeRecognitionRef.current = null
    setWakeArmed(false)
  }, [])

  const startWakeListening = useCallback(() => {
    if (busyRef.current || wakeRecognitionRef.current) return
    const Recognition = getSpeechRecognition()
    if (!Recognition) return

    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    let triggered = false

    recognition.onresult = (event) => {
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i]?.[0]?.transcript
        if (transcript && containsWakePhrase(transcript)) {
          triggered = true
          recognition.stop()
          return
        }
      }
    }
    recognition.onerror = () => {
      if (!triggered) failureRef.current += 1
    }
    recognition.onend = () => {
      wakeRecognitionRef.current = null
      setWakeArmed(false)
      if (triggered) {
        handleWakeRef.current()
        return
      }
      if (!voiceOnRef.current || busyRef.current) return
      if (failureRef.current >= MAX_CONSECUTIVE_FAILURES) {
        failureRef.current = 0
        setVoiceOn(false)
        setMicError('Voice mode turned off — could not keep the microphone listening.')
        return
      }
      startWakeListening()
    }

    wakeRecognitionRef.current = recognition
    try {
      recognition.start()
      setWakeArmed(true)
    } catch {
      wakeRecognitionRef.current = null
    }
  }, [setVoiceOn])

  async function handleWake() {
    busyRef.current = true
    failureRef.current = 0
    setMicError(undefined)
    setOpen(true)
    await speak('Yes?')
    const transcript = await listenOnce()
    if (transcript) await send(transcript)
    busyRef.current = false
    if (voiceOnRef.current) startWakeListening()
  }
  handleWakeRef.current = handleWake

  useEffect(() => {
    voiceOnRef.current = voiceOn
    if (!voiceOn) {
      stopWakeListening()
      return
    }
    failureRef.current = 0
    startWakeListening()
    return () => stopWakeListening()
  }, [voiceOn, startWakeListening, stopWakeListening])

  function toggleVoiceMode() {
    const next = !voiceOn
    setMicError(undefined)
    setVoiceOn(next)
    try {
      localStorage.setItem(VOICE_MODE_KEY, String(next))
    } catch {
      // Private browsing / blocked storage — the toggle still works for this tab.
    }
  }

  // The panel's own mic button, separate from the hook's toggleListening:
  // only one SpeechRecognition instance can safely run at a time, so a
  // manual tap has to pause the wake-word listener first (it's already
  // running in the background whenever voice mode is on) and hand it
  // back afterwards, the same way the wake flow itself does.
  async function handleManualMic() {
    if (listening) {
      toggleListening()
      return
    }
    busyRef.current = true
    stopWakeListening()
    const transcript = await listenOnce()
    if (transcript) await send(transcript)
    busyRef.current = false
    if (voiceOnRef.current) startWakeListening()
  }

  if (!mounted) return null

  return createPortal(
    <div className="nexa-widget">
      {open && (
        <div className="nexa-widget-panel">
          <div className="nexa-widget-panel-header">
            <span className="nexa-widget-panel-title">
              <BrainCircuit size={15} aria-hidden /> Nexa AI
            </span>
            <div className="nexa-widget-panel-actions">
              {ttsSupported && speechSupported && (
                <button
                  type="button"
                  className={voiceOn ? 'chat-mic-button chat-mic-button--active' : 'chat-mic-button'}
                  onClick={toggleVoiceMode}
                  aria-pressed={voiceOn}
                  aria-label={voiceOn ? 'Turn off voice mode' : 'Turn on voice mode — say "hello Nexa" to talk'}
                  title={voiceOn ? 'Voice mode on — say "hello Nexa" anytime' : 'Turn on voice mode'}
                >
                  {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
              )}
              <button type="button" className="nexa-widget-close" onClick={() => setOpen(false)} aria-label="Close chat">
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="chat-console-messages nexa-widget-messages" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
                {m.text}
              </div>
            ))}
            {pending && <div className="chat-bubble chat-bubble--assistant chat-bubble--pending">Thinking…</div>}
          </div>

          {(error || micError) && <p className="error nexa-widget-error">{error ?? micError}</p>}
          {voiceOn && !error && !micError && (
            <p className="nexa-widget-hint">{wakeArmed ? 'Listening for "hello Nexa"…' : 'Voice mode on'}</p>
          )}

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
                onClick={handleManualMic}
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
            <button type="submit" disabled={pending || !input.trim()} aria-label="Send">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className={open ? 'nexa-widget-fab nexa-widget-fab--open' : 'nexa-widget-fab'}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close Nexa AI chat' : 'Open Nexa AI chat'}
      >
        <BrainCircuit size={20} aria-hidden />
        {voiceOn && <span className="nexa-widget-fab-pulse" aria-hidden />}
      </button>
    </div>,
    document.body
  )
}
