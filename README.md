# Medsol AI Marketing OS

Enterprise AI Marketing Operating System for Medsol Corporation.

Current release: v0.2.0 — executable governance vertical slice.

Architecture: Agent -> Policy -> Application Service -> Domain -> Database, with Audit and Outbox attached to authoritative mutations.

Agents do not mutate authoritative business state directly.

Development:
pnpm install
pnpm prisma generate
pnpm typecheck
pnpm test
pnpm build

See docs/architecture/16-executable-vertical-slice.md.