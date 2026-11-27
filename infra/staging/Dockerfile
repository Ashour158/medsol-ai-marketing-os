# Alpha packaging candidate: build-only, no publication or deployment.
# CI supplies a reviewed/resolved Node base digest and the captured dependency
# lockfile. Do not build against an unpinned base or an absent lockfile.
ARG NODE_IMAGE
ARG RUNTIME_IMAGE
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV CI=true NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY . .
RUN test -s pnpm-lock.yaml && pnpm install --frozen-lockfile
RUN pnpm exec prisma generate --schema prisma/schema.prisma \
 && pnpm --filter './packages/**' build \
 && pnpm --filter @medsol/api build \
 && pnpm --filter @medsol/web build
# Minimal runtime: do not copy the builder OS, npm, Corepack, shells or package managers.
# Preserve the workspace dependency links and generated Prisma runtime for the
# first compatibility rehearsal; pruning workspace dev dependencies is separate.
FROM ${RUNTIME_IMAGE} AS common
WORKDIR /app
COPY --from=build --chown=65532:65532 /app /app
ENV PATH=/nodejs/bin:/usr/local/bin:/usr/bin:/bin
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    MARKETING_EXTERNAL_EFFECTS_ENABLED=false \
    MARKETING_AI_REASONING_ENABLED=false \
    MARKETING_REAL_EMAIL_ENABLED=false \
    MARKETING_REAL_PROVIDER_PUBLISHING_ENABLED=false \
    MARKETING_PROVIDER_EGRESS_ENABLED=false \
    MARKETING_LIVE_DELIVERY_ENABLED=false \
    MARKETING_LIVE_CAMPAIGN_EXECUTION_ENABLED=false
USER 65532:65532
ENTRYPOINT []
FROM common AS api
WORKDIR /app/apps/api
ENV PORT=3001
EXPOSE 3001
CMD ["node","dist/main.js"]
FROM common AS web
WORKDIR /app/apps/web
ENV PORT=3000
EXPOSE 3000
CMD ["node","node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port","3000"]
