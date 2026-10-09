# [S] Bump @moq to the draft-18 release

## Goal

The sites build against `@moq/watch` 0.6, `@moq/publish` 0.5, and `@moq/boy`
0.4 or newer, so moq.watch decodes a draft-18 SUBSCRIBE_OK's LARGEST_OBJECT
(fixed in moq-dev/moq#3561, first in `@moq/net` 0.4.0) and plays.

## Plan

The current `^0.5.4` / `^0.4.7` / `^0.3.1` ranges cannot resolve to these
minors, and each is a breaking release, so adapt the call sites to whatever
API moved. Bump all three together so they share one `@moq/net`.

Verify in the dev servers (`just dev`, `just dev-pub`, `just dev-watch`):
publish and watch back a `try` broadcast, and play from a draft-18 relay if
one is reachable.

## Closes

- [#166](https://github.com/moq-dev/moq.dev/issues/166) - moq.watch cannot play from draft-18 relays
