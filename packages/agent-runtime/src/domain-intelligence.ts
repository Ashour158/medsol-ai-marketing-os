import { AGENT_ROSTER } from './roster.js';
export interface DomainEvidence {
 sourceId:string; sourceUrl:string; sourceTitle:string; publishedAt:string|null;
 verified:boolean; reviewed:boolean; organizationId:string; sector:string;
}
export interface DomainAgentInput {
 organizationId:string; objective:string; market:string; audience:string;
 productId:string|null; evidence:readonly DomainEvidence[];
 brandMasterVersion:string|null; consentReference:string|null;
}
export type DomainGate = 'PASS'|'REVIEW'|'BLOCK';
export interface DomainAssessment {
 agentId:string; domain:string; gate:DomainGate; reasons:string[];
 evidenceIds:string[]; suggestedActions:string[]; confidence:'UNVERIFIED'|'EVIDENCE_REVIEWED';
}
const DOMAINS:Record<string,string>={
 'MKT-CMO-001':'MARKETING_GOVERNANCE','MKT-OPS-001':'OPERATIONS','MKT-STR-001':'MARKET_INTELLIGENCE',
 'MKT-ANA-001':'ANALYTICS','MKT-PM-001':'PRODUCT_MARKETING','MKT-GROWTH-001':'GROWTH',
 'MKT-CRM-001':'CUSTOMER_LIFECYCLE','MKT-CONT-001':'CONTENT','MKT-SOC-001':'SOCIAL',
 'MKT-CREATIVE-001':'CREATIVE','MKT-BRAND-001':'BRAND','MKT-EVENT-001':'EVENTS',
 'MKT-SCI-001':'SCIENTIFIC_COMPLIANCE'
};
const NEEDS_EVIDENCE=new Set(['MKT-STR-001','MKT-ANA-001','MKT-PM-001','MKT-SCI-001']);
const NEEDS_BRAND=new Set(['MKT-BRAND-001','MKT-CONT-001','MKT-CREATIVE-001','MKT-SOC-001']);
const NEEDS_CONSENT=new Set(['MKT-CRM-001','MKT-GROWTH-001']);
export function assessDomain(agentId:string,input:DomainAgentInput):DomainAssessment{
 if(!AGENT_ROSTER.some(m=>m.id===agentId))throw new Error('Unknown agent domain');
 if(!input.organizationId||!input.objective||!input.market||!input.audience)throw new Error('Missing authoritative marketing context');
 const evidence=input.evidence.filter(e=>e.organizationId===input.organizationId);
 if(evidence.length!==input.evidence.length)throw new Error('Cross-tenant evidence prohibited');
 const reviewed=evidence.filter(e=>e.reviewed&&e.verified);
 const reasons:string[]=[];
 if(NEEDS_EVIDENCE.has(agentId)&&reviewed.length===0)reasons.push('independently_verified_evidence_required');
 if(NEEDS_BRAND.has(agentId)&&!input.brandMasterVersion)reasons.push('authoritative_brand_master_required');
 if(NEEDS_CONSENT.has(agentId)&&!input.consentReference)reasons.push('consent_record_required');
 if(agentId==='MKT-ANA-001')reasons.push('authoritative_metrics_adapter_required');
 if(agentId==='MKT-OPS-001')reasons.push('human_campaign_release_required');
 const suggestedActions=AGENT_ROSTER.find(m=>m.id===agentId)!.capabilities.filter(c=>!c.startsWith('APPROVE')&&!c.startsWith('PUBLISH'));
 return{agentId,domain:DOMAINS[agentId]!,gate:reasons.length?'REVIEW':'PASS',reasons,
  evidenceIds:reviewed.map(e=>e.sourceId),suggestedActions,
  confidence:reviewed.length?'EVIDENCE_REVIEWED':'UNVERIFIED'};
}
export function assertDomainReleaseAllowed(assessments:readonly DomainAssessment[]):never{
 throw new Error('Domain assessments cannot authorize external publishing; authoritative human approval and connector policy required');
}
