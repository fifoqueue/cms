# syntax=docker/dockerfile:1
FROM getmeili/meilisearch:v1.55.0 AS meilisearch
RUN chown -R 1000:1000 /meili_data
USER 1000:1000

FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run --filter @cms/api db:generate
RUN bun run --filter @cms/web build

FROM oven/bun:1.4.4 AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prisma CLI is needed at runtime for setup and migrations.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages ./packages

FROM runtime AS api
COPY --from=build /app/apps/api ./apps/api
WORKDIR /app/apps/api
RUN mkdir -p data && chown bun:bun data
USER bun
ENV API_HOST=0.0.0.0 API_PORT=4000
EXPOSE 4000
CMD ["bun", "--no-env-file", "src/main.ts"]

FROM runtime AS web
COPY --from=build /app/apps/web ./apps/web
WORKDIR /app/apps/web
RUN mkdir -p data && chown bun:bun data
USER bun
ENV WEB_HOST=0.0.0.0 WEB_PORT=3000
EXPOSE 3000
CMD ["bun", "--no-env-file", "server.js"]
