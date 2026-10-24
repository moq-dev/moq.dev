# [XS] Drain the voice goodbye instead of waiting

## Goal

When a `/voice` call ends, the page's final `session-ending` record reaches
the agent because the connection drains on close, not because of a fixed
wait.

## Plan

The page no longer waits before unmounting `<moq-publish>`. Unmounting only
releases the element's pooled connection handle, and the shared session keeps
sending the cleanly finished transcript track until the pool's 2 s linger
(`LINGER_MS` in `moq/js/net/src/connection/pool.ts`) expires. A local relay
test with the real element delivered the record every time; closing the
connection at once lost it every time.

Remaining:

- Upstream in moq-dev/moq: when the linger expires, `Reload`'s teardown
  (`moq/js/net/src/connection/reload.ts`) calls `Established.abort()`, so the
  draining `close()` never runs on this path and the linger is still a fixed
  wait. Swapping it for `close()` delivered the record with the connection
  closed at once. Bump the `moq` submodule once that lands.
- A real call on new.moq.dev/voice: hang up and confirm the agent logs the
  `session-ending` record rather than a timeout. Needs a maintainer (Turnstile
  and a mic).
