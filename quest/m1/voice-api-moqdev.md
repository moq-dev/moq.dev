# [XS] moq.pro accepts moq.dev

## Goal

The staging voice demo API (`api.moq.wtf/voice/sessions`) accepts a session
started from `https://moq.dev`, `https://new.moq.dev`, and
`http://localhost:4321`: the wtf Turnstile widget lists those hostnames and
the API answers their CORS preflight.

This quest tracks a condition outside the repository. When it holds, delete
this quest and every `Required` entry that links it.

## Plan

moq.pro tracks the change as
[its own quest](https://github.com/moq-dev/moq.pro/blob/main/quest/m1/voice-moqdev.md).
Check by starting a session from `just dev` against `api.moq.wtf`.
