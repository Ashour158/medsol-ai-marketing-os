# T4C — Multi-campaign readiness and blocker command board

## Reuse Map
| Concept | Existing authoritative owner | T4C use |
|---|---|---|
| Campaign listing | `MarketingReadService.campaigns` | Tenant-scoped listing, maximum 25 displayed per refresh |
| Journey stages | `MarketingReadService.offlineJourney` | Per-campaign stages, approval references, creative and performance context |
| Actions | Existing Campaign Journey, Approval, Creative, Social, Email, Knowledge workspaces | Deep links to the existing operator workspaces; no independent write path |
| Tenant authorization | Existing OIDC session, BFF and Nest guard | Every fetch reuses authenticated `/api/marketing/` routes |
| Testing | Existing web unit test/TypeScript/build/CI pipeline | Strict malformed response and false-readiness test corpus |

## Functionality
A new first-class Campaign Readiness Board computes ten explainable *offline* milestones across at most 25 campaigns from the existing authoritative journeys. Four-at-a-time reads protect the API. The board distinguishes INCOMPLETE, BLOCKED, UNKNOWN and SIMULATION_COMPLETE; missing or inconsistent provenance fails closed rather than inventing a successful score. It identifies pending work and links to the existing operator studio for the action, avoiding any new approval/campaign/creative engine or database table.

The board is **read-only**, uses tenant-bound backend API responses, and does not fetch real external provider accounts. It never claims independent scientific verification, production approval, real social/email publishing, attributable sales or commercial ROI.

## Acceptance boundaries
Unit tests verify identity mismatch, absent evidence, unsafe status, incomplete/blocked/complete distinctions, UNKNOWN accounting and no production claim. CI must pass repository-wide tests and build before merge. Readiness is capped at the first 25 listed campaigns. Persistent staging, independent QA and real providers remain pending; release is `NOT_CERTIFIED`.
