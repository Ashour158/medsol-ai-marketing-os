import { z } from 'zod';

export type DomainEvent<T=unknown>={eventId:string;eventType:string;eventVersion:number;organizationId:string;occurredAt:string;correlationId:string;causationId?:string;aggregateType:string;aggregateId:string;aggregateVersion:number;payload:T};
export type CommandEnvelope<T=unknown>={commandId:string;commandType:string;organizationId:string;requestedAt:string;correlationId:string;payload:T};
export const EVENT_VERSION=1;
export const DomainEventSchema=z.object({eventId:z.string().min(1),eventType:z.string().min(1),eventVersion:z.number().int().positive(),organizationId:z.string().min(1),occurredAt:z.string().datetime(),correlationId:z.string().min(1),causationId:z.string().min(1).optional(),aggregateType:z.string().min(1),aggregateId:z.string().min(1),aggregateVersion:z.number().int().positive(),payload:z.unknown()});