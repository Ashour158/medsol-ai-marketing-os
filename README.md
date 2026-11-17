# Medsol AI Marketing OS

Enterprise AI Marketing Operating System for Medsol Corporation.

## Architecture

One governed marketing operating system — not 13 disconnected bots.

**Authority-first:** every business concept has one authoritative owner.

**Agents are controlled executors:** agents reason and propose actions, but domain services, workflows, policy and approval engines remain authoritative.

**Command/event separation:** commands request work; immutable events record facts.

**Risk-aware autonomy:** R0/R1 can be autonomous when permitted; R2/R3 are approval-controlled; R4 requires human authority.

## Agent organization

13 governed AI roles cover CMO, Operations, Strategy, Analytics, Product Marketing, Growth, CRM, Content, Social, Creative, Brand, Events and Scientific/Compliance.

## Current build

- TypeScript monorepo foundation
- Shared contracts
- Campaign domain lifecycle
- Policy/risk engine
- Agent runtime contract
- Prisma tenant-aware core model
- NestJS API foundation
- Next.js command center foundation
- PostgreSQL/Redis/Kafka local infrastructure
- Architecture and governance documentation

## Build sequence

Foundation → Authority/Lifecycle → Policy/Approval/Audit → Agent Runtime → Orchestration → First Vertical Slice → Full Agent Organization → Production Hardening.
