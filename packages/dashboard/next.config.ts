import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @nexa-ai/permission-engine's agents (waitlist-triage, transaction-
  // review, campaign, creative-concepts, opportunity-discovery) load
  // their system prompts from packages/permission-engine/prompts/*.md at
  // runtime via readFileSync(), not a static import — Next's build-time
  // file tracer (what decides which files actually ship in a Vercel
  // serverless function) can't see a dynamically-computed fs path, so it
  // silently left the whole prompts/ directory out of the deployed
  // bundle. Confirmed live: every one of these agents threw `ENOENT:
  // .../prompts/<name>.md` in production despite working in every local
  // test and CLI run, since only Vercel's actual filesystem is missing
  // the file — `next dev`/`next build` locally read straight off disk,
  // never through the traced bundle. This tells the tracer to include
  // it explicitly rather than switching every agent's prompt loading to
  // a static import, which would need identical changes in five files
  // for one shared root cause.
  outputFileTracingIncludes: {
    '/**': ['../permission-engine/prompts/**'],
  },
}

export default nextConfig
