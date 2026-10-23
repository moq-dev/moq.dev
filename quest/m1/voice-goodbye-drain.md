# [XS] Drain the voice goodbye instead of waiting

## Goal

When a `/voice` call ends, the page's final `session-ending` record reaches
the agent because the connection drains on close, not because the page waits
a fixed 250 ms (`GOODBYE_MS` in `src/components/voice-demo.tsx`) before
unmounting `<moq-publish>`.

## Plan

Decided 2026-10-19: once `@moq/net`'s draining `close()` is available, drop
the wait and close through it. The `moq` submodule now provides it.

Check how `<moq-publish>` closes its connection before relying on it: the
element holds a pooled connection handle, and the pool lingers before
closing, so unmounting may not drain the broadcast's last frames the way an
explicit `close()` does. Prove it with a real call: hang up and confirm the
agent logs the `session-ending` record rather than a timeout.
