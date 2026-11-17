import { z } from "zod";
export const RiskLevelSchema=z.enum(["R0","R1","R2","R3","R4"]);
export type RiskLevel=z.infer<typeof RiskLevelSchema>;
export const MarketingRequestSchema=z.object({organizationId:z.string().min(1),requestedOutcome:z.string().min(3),objectiveId:z.string().optional(),productId:z.string().optional(),market:z.string().optional(),audience:z.string().optional(),deadline:z.coerce.date().optional()});
export const CreateCampaignCommandSchema=z.object({organizationId:z.string().min(1),code:z.string().regex(/^[A-Z0-9_-]+$/),name:z.string().min(2),objectiveId:z.string(),productId:z.string().optional(),riskLevel:RiskLevelSchema});
export const CampaignCreatedEventSchema=z.object({eventId:z.string(),organizationId:z.string(),campaignId:z.string(),code:z.string(),occurredAt:z.coerce.date(),correlationId:z.string(),causationId:z.string().optional()});
export type MarketingRequest=z.infer<typeof MarketingRequestSchema>; export type CreateCampaignCommand=z.infer<typeof CreateCampaignCommandSchema>; export type CampaignCreatedEvent=z.infer<typeof CampaignCreatedEventSchema>;