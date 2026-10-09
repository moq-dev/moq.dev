# [XS] Deploy live

## Goal

The maintainer runs `just deploy live`, and the live moq.dev, moq.pub, and
moq.watch serve the bump and the private `try` demos. Nothing deploys on
merge, and an agent never deploys without the maintainer's go-ahead.

## Plan

One deploy ships the @moq bump (the #166 fix) and the `try` demos (decided 2026-10-09).

Check after deploying: a bare `moq.pub/` mints a `try` broadcast instead of
redirecting to `/anon/...`; publish from moq.dev's `/publish` and from
moq.pub, open the share link in a private window, confirm it plays, and that
the same path is refused tokenless. moq.pro tracks the same check as
[its condition quest](https://github.com/moq-dev/moq.pro/blob/main/quest/m1/try/moq-dev-live.md).
