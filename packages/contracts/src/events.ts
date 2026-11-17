export type DomainEvent<T=unknown>={eventId:string;eventType:string;organizationId:string;occurredAt:string;correlationId:string;causationId?:string;payload:T};
export type CommandEnvelope<T=unknown>={commandId:string;commandType:string;organizationId:string;requestedAt:string;correlationId:string;payload:T};
export const EVENT_VERSION=1;