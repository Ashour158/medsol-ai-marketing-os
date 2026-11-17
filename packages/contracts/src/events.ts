export type DomainEvent<TPayload=unknown>={eventId:string;eventType:string;organizationId:string;occurredAt:string;correlationId:string;causationId?:string;payload:TPayload};
export type CommandEnvelope<TPayload=unknown>={commandId:string;commandType:string;organizationId:string;requestedAt:string;correlationId:string;payload:TPayload};
export const EVENT_VERSION=1;