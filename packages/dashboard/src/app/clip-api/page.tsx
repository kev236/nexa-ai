import type { Metadata } from 'next'
import { RequestApiAccessForm } from '@/components/RequestApiAccessForm'

export const metadata: Metadata = {
  title: 'Clip Scoring API — Nexa AI',
  description: "Score a short-form clip's virality and copyright risk before you spend time editing it. One API call, real reasoning, no dashboard required.",
}

const EXAMPLE_REQUEST = `curl https://<your-nexa-ai-domain>/api/v1/score-clip \\
  -H "Authorization: Bearer nexa_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "sourceDescription": "Streamer reacts live to finding out they won the lottery",
    "sourceUrl": "https://twitch.tv/..."
  }'`

const EXAMPLE_RESPONSE = `{
  "title": "He Just Found Out LIVE",
  "viralityScore": 87,
  "copyrightRisk": "medium",
  "copyrightNotes": "Streamer's own footage, likely fine with credit
    and a fair-use reaction framing — confirm license terms.",
  "captions": [
    { "platform": "tiktok", "caption": "wait for his reaction 😭",
      "hashtags": ["fyp", "viral", "reaction"] },
    ...
  ],
  "recommendation": "REPOST",
  "reasoning": "Clear hook, genuine surprise, strong payoff in
    under 3 seconds — high retention potential.",
  "confidence": 0.82
}`

export default function ClipApiLandingPage() {
  return (
    <div className="clip-api-page">
      <header className="clip-api-hero">
        <div className="clip-api-hero-inner">
          <span className="clip-api-eyebrow">Nexa AI · API</span>
          <h1>Know if a clip is worth editing before you edit it.</h1>
          <p className="clip-api-lede">
            One API call scores a short-form clip on virality potential and copyright risk, and drafts a
            caption for YouTube, TikTok, and Instagram — the same evaluation a real repost business runs on
            every clip it considers, before spending an hour cutting something nobody watches.
          </p>
          <a href="#request-access" className="clip-api-cta">
            Request access
          </a>
        </div>
      </header>

      <main className="clip-api-body">
        <section className="clip-api-section">
          <h2>What you get back</h2>
          <p className="clip-api-section-lede">
            Send a description of the clip (and a source URL if you have one) — get a virality score, a
            copyright-risk read with real reasoning behind it, ready-to-post captions for three platforms, and
            a plain-English recommendation.
          </p>
          <div className="clip-api-code-grid">
            <div className="card">
              <p className="meta mono">Request</p>
              <pre className="clip-api-code">{EXAMPLE_REQUEST}</pre>
            </div>
            <div className="card">
              <p className="meta mono">Response</p>
              <pre className="clip-api-code">{EXAMPLE_RESPONSE}</pre>
            </div>
          </div>
        </section>

        <section className="clip-api-section">
          <h2>How it works</h2>
          <div className="clip-api-steps">
            <div className="card">
              <span className="status-badge status-active">1</span>
              <p className="reasoning">Request access below — tell us what you&apos;d use it for.</p>
            </div>
            <div className="card">
              <span className="status-badge status-active">2</span>
              <p className="reasoning">We reply by email and set up billing directly, no card form on this site.</p>
            </div>
            <div className="card">
              <span className="status-badge status-active">3</span>
              <p className="reasoning">You get an API key — one header, one endpoint, real answers.</p>
            </div>
          </div>
        </section>

        <section className="clip-api-section" id="request-access">
          <h2>Request access</h2>
          <p className="clip-api-section-lede">Pricing is worked out directly over email based on your volume — tell us what you need.</p>
          <RequestApiAccessForm />
        </section>
      </main>

      <footer className="clip-api-footer">
        <p className="meta">Built and run by Nexa Labs.</p>
      </footer>
    </div>
  )
}
