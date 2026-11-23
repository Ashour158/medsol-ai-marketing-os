# T8D — Social/email scenario evidence, fail-closed exports and tenant-boundary UI reset

## Reuse Map
- **Social**: CampaignPublicationService and existing provider simulator own every publication intent, attempt and deterministic offline provider scenario. The existing Social Studio only renders/export their sanitized result.
- **Email**: SyntheticAudienceEmailService owns anonymous contacts, simulated consent/suppression, eligible snapshot, journey timing and synthetic ESP outcomes. The existing Email Studio only renders/export their summarized result.
- **CSV**: Shared `apps/web/src/lib/offline-evidence-csv.ts` remains the single unsigned customer CSV serializer. No new exporter authority or independent receipt generation.
- **Identity**: Existing signed OIDC/role/tenant API controls remain mandatory. The existing Home workspace now remounts Creative, Social, Email studios on exact user+tenant identity switch, preventing prior-user cached UI data from surfacing after session changes.

## Implemented
- **Social Studio**: download one sanitized CSV for an actual returned simulator outcome, including scenario, provider catalog key, virtual transport/readback/callback counts and explicit zero real requests/receipts, with safe rejection of automatic retries and forged real publication.
- **Email Studio**: download an anonymized summary of the actual returned synthetic ESP simulation, including eligible/withdrawn/complaint/missing opt-in counts, bounded virtual scheduling and explicit zero real sends/receipts. No contact IDs or recipient emails are included.
- Both exports use existing CSV formula neutralization, are fail-closed on contradictory source flags and are marked `NOT_CERTIFIED`.
- Tests cover ambiguous social outcomes (including timeout after acceptance), forced live transport/receipt flags, malformed callback counts, fake email delivery/consent, inconsistent audience and invalid virtual schedules.

## Still blocked
No Meta/LinkedIn/X publishing, real ESP messages, customer contact consent, independent provider UAT, persistent staging or production release is claimed. T6B remains the only release certification authority. **NOT_CERTIFIED**.
