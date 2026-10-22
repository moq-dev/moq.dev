# [S] Type-check .astro files

## Goal

`just check` and CI type-check the `.astro` files under `src/`, which have never
been checked: `check` has always been `biome ci && tsc --noEmit`.

## Plan

- Use [@astrojs/ts-content-mapper](https://github.com/withastro/astro/tree/main/packages/language-tools/ts-content-mapper)
  with plain `tsc` (`contentMappers` in `tsconfig.json`, `--runExternalCode`).
  It needs TypeScript 7.1.
- Decided: adopt on the TypeScript 7.1 beta now rather than wait for stable,
  then move to 7.1 stable when it ships.
- Don't bring back `astro check` on TypeScript 6; it refuses TypeScript 7 and
  the mapper is Astro's intended path.
- Watch for [withastro/astro#18471](https://github.com/withastro/astro/issues/18471)
  (reported on the `strictest` preset; this repo extends `strict`) and for Solid
  JSX inside `.astro` files. Fix real errors the existing files surface in the
  same PR.
- MDX stays unchecked; the mapper only covers `.astro`.
