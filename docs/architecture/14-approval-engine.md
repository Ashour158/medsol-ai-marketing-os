# Approval Engine

Approval is an independent authority boundary.

A policy decision may require approval, but an agent cannot approve its own action. Approval records are tenant-scoped, immutable in decision history, linked to the business object, risk level and required authority.

Approval decisions are explicit: PENDING, APPROVED, APPROVED_WITH_CONDITIONS, REJECTED. Workflow resumes only from an authoritative approval event.