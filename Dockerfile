FROM oven/bun:1.3.4-slim AS base
ENV NODE_ENV=production

COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache bun install --production --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=bun,target=/root/.bun/install/cache bun install --frozen-lockfile
RUN bun run build

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
ENV HOST="0.0.0.0"
CMD [ "bun", "./dist/server/entry.mjs" ]