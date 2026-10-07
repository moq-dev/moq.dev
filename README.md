<p align="center">
	<img height="128px" src="https://github.com/moq-dev/moq/blob/main/.github/logo.svg" alt="Media over QUIC">
</p>

This repository contains the code for three sites:

-   [moq.dev](https://moq.dev) — the blog and demos, in `src/`
-   [moq.pub](https://moq.pub) — a bare-bones publisher, in `sites/pub`
-   [moq.watch](https://moq.watch) — a bare-bones player, in `sites/watch`

The player sites require `/<project>/<broadcast>`. A bare moq.pub URL mints a
private broadcast in `try` using the configured API. Share its watch link,
which carries no publish token. Anyone with that link can watch; other visitors
cannot list the broadcasts. Credentials last one hour.

Legacy `?project=&name=` links require both values. The moq.dev watch page also
requires both, for example `/watch?project=demo&name=bbb.hang`. There is no
implicit project. Explicit public `demo` streams and the `anon` sandbox remain
available.

Use `?cloudflare=draft-16` to connect either player to
`https://draft-16.cloudflare.mediaoverquic.com` without spelling out the full
`?relay=` value. The first path segment remains the Cloudflare relay token.

Media connects directly to the relay. Private demos also call `/try/token` and
`/try/watch` on the API configured by `PUBLIC_API_URL`.
You'll either need to run a local server using [moq](https://github.com/moq-dev/moq) or use a public server such as `cdn.moq.pro`.

Join the [Discord](https://discord.moq.dev) for updates and discussion.

## Setup

The toolchain (`bun`, `node`, `just`) is pinned in `flake.nix`:

```bash
nix develop -c just dev
```

The Nix shell supports Linux (x86-64 and ARM64) and Apple Silicon macOS.
Intel Macs should use the manual setup below; the pinned nixpkgs no longer
supports Intel macOS.

With [direnv](https://direnv.net/) installed, `direnv allow` loads that shell
automatically on every `cd` into the repo.

Don't have Nix? Install `bun`, Node.js 24, and `just` yourself, matching the `bun`
version in `packageManager`. Either way, the dependencies come from `bun`:

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

The repo-root `.env.<mode>` files configure the API, relay, publisher, and player
URLs together. For a local moq.pro stack, override `PUBLIC_API_URL` and
`PUBLIC_RELAY_URL` with the ports printed by `just dev` in that repository.

## Deploy

`just deploy` builds and uploads all three sites to Cloudflare, staging by
default; `just deploy live` goes to production. Deploy and seed the private
`try` project in the matching moq.pro environment before deploying these clients.

## License

Licensed under either:

-   Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
-   MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)
