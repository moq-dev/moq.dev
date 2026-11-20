# [XS] Drain the voice goodbye instead of waiting

## Goal

When a `/voice` call ends, the page's final `session-ending` record reaches
the agent because the connection drains on close, not because of a fixed
wait.

## Plan

The page no longer waits before unmounting `<moq-publish>`, and the pinned
`moq` submodule drains the session when its reconnect loop ends
([moq-dev/moq#6630](https://github.com/moq-dev/moq/pull/6630)), so the
record goes out whenever the connection closes. A local relay test with the
connection closed at once delivered it every time; swapping the drain back
to an abort lost it every time.

Remaining: a real call on new.moq.dev/voice. Hang up and confirm the agent
logs the `session-ending` record rather than a timeout. Needs a maintainer
(Turnstile and a mic).
