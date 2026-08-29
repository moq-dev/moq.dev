<p align="center">
	<img height="128px" src="https://github.com/moq-dev/moq.dev/blob/main/public/home/logo.svg" alt="Media over QUIC">
</p>

This repository contains the code for three sites:

-   [moq.dev](https://moq.dev) — the blog and demos, in `src/`
-   [moq.pub](https://moq.pub) — a bare-bones publisher, in `sites/pub`
-   [moq.watch](https://moq.watch) — a bare-bones player, in `sites/watch`

The player sites use the path to name a broadcast: publish at
`moq.pub/anon/lazy-otter-4f21.hang` and watch it back at
`moq.watch/anon/lazy-otter-4f21.hang`. Visiting [moq.pub](https://moq.pub) with
no path picks a random name for you.

Use `?cloudflare=draft-16` to connect either player to
`https://draft-16.cloudflare.mediaoverquic.com` without spelling out the full
`?relay=` value. The first path segment remains the Cloudflare relay token.

These are clients only.
You'll either need to run a local server using [moq](https://github.com/moq-dev/moq) or use a public server such as `cdn.moq.pro`.

Join the [Discord](https://discord.moq.dev) for updates and discussion.

## Setup

Install the dependencies with `bun`:

```bash
bun i
```

## Development

Run a development web server:

```bash
just dev         # moq.dev
just dev-pub     # moq.pub, on :5174
just dev-watch   # moq.watch, on :5173
```

## Deploy

`just deploy` builds and uploads all three sites to Cloudflare, staging by
default; `just deploy live` goes to production.

## License

Licensed under either:

-   Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
-   MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)
