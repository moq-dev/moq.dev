# [M] Voice AI demo page

## Goal

`/voice` lets a reader talk to the moq.pro Pipecat agent over MoQ and shows a
live transcript of both sides. `/demo` gets a card for it. The component is
reusable, so a blog post can embed it later; the post itself (branch
`voice-api-2`) is not part of this quest.

## Plan

Decided 2026-10-09:

- **A native Solid component, not moq.pro's iframe.** The buffer view needs
  the player's internals, which an iframe from another site hides, and demos
  belong in moq.dev. moq.pro keeps its own `/voice` page.
- **It talks to the moq.pro session API directly.**
  `POST /voice/sessions {turnstileToken}` returns `{id, relayUrl,
  requestBroadcast, responseBroadcast, token, expiresAt}`. One token
  publishes the request and subscribes the response. Poll
  `GET /voice/sessions/:id` until the agent claims it, and render refusals by
  `code` (`busy`, `rate_limit`, `daily_budget`, ...).
  moq.pro's `app/src/lib/VoiceDemo.svelte` is the reference client.
  The older component on `voice-ai2` / `codex/voice-demo-embed` predates this
  contract (`publishToken`/`watchToken`, no poll), so port its Turnstile
  loader and layout, not its session code.
- **Live points at staging.** The demo only runs on `api.moq.wtf` until
  moq.pro's production quest lands, so a separate `PUBLIC_VOICE_API_URL` is
  `https://api.moq.wtf` for live and staging, and `PUBLIC_TURNSTILE_SITE_KEY`
  is the wtf widget's public key. `PUBLIC_API_URL` stays on its environment's
  API for `try`.
- **No Pipecat client.** `<moq-publish>` sends the mic and `<moq-watch>`
  plays the reply with a latency ceiling near the agent's 25s send-ahead.
  The page does the small part of RTVI the agent needs itself: publish a
  `transcript.json.z` track carrying `client-ready`, and read the agent's
  `transcript.json.z` (not in the catalog; subscribe by name) for
  transcripts. On barge-in the agent retires `bot-audio` for
  `bot-audio-<n>` through the catalog, which `<moq-watch>` follows.
- The transcript renders the way `src/components/voice/` lays out words, so
  [Voice buffers under the words](/quest/m1/voice-buffers.md) can draw under
  them.

Verify against staging in `just dev`: a conversation, barge-in, Stop, the
five-minute limit, and a `busy` refusal.

## Required

- [moq.pro accepts moq.dev](/quest/m1/voice-api-moqdev.md) - the wtf voice API and Turnstile widget serve the moq.dev origin
