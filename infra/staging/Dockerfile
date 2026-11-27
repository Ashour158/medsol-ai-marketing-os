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
# Minimal maintained Ubuntu LTS runtime. Noble's OpenSSL 3.0 branch is
# not affected by CVE-2026-107494 and CVE-2026-124709 (Ubuntu security tracker).
# Do not copy the builder OS or npm/Corepack. Apply available signed distro
# updates, preserve package metadata and scan the actual resulting filesystem.
FROM ${RUNTIME_IMAGE} AS common
WORKDIR /app
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates libssl3t64 libstdc++6 libgcc-s1 zlib1g \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/bin/node /usr/local/bin/node
COPY --from=build --chown=65532:65532 /app /app
ENV PATH=/usr/local/bin:/usr/bin:/bin HOME=/tmp
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
