import {AGENT_ROSTER} from './roster.js';

export type MarketingWorkPackage={
 agentId:string; deliverable:string; objective:string; market:string|null; audience:string|null;
 requiredInputs:string[]; analysisSteps:string[]; acceptanceChecks:string[];
 successIndicators:string[]; reviewOwner:string; blockedOn:string[];
 references:{topic:string;url:string;verification:'UNVERIFIED'}[];
 catalog:{source:string|null;product:{id:string;code:string;name:string;vendor:string|null}|null;objective:{id:string;name:string}|null;scientificClaimsVerified:false;regulatoryApprovalVerified:false};
 executable:false;
};
type Playbook={deliverable:string;inputs:string[];steps:string[];checks:string[];metrics:string[];owner:string};
const PLAYBOOKS:Record<string,Playbook>={
 'MKT-CMO-001':{deliverable:'Strategic objective and investment-priority proposal',inputs:['commercial objectives','portfolio constraints','approved budget'],steps:['Define measurable outcomes and time horizon','Compare proposed programs against portfolio and margin priorities','Recommend a ranked campaign portfolio with assumptions'],checks:['Objective has measurable owner and target','Budget decision requires human approval'],metrics:['qualified pipeline','marketing influenced revenue'],owner:'CMO'},
 'MKT-OPS-001':{deliverable:'Cross-functional campaign execution plan',inputs:['approved strategy','campaign calendar','owner capacity'],steps:['Map delivery owners and RACI','Sequence governed production, review and measurement','Specify deadlines, dependencies and escalation'],checks:['Each task has one owner','No unapproved external execution'],metrics:['on-time completion','approval cycle time'],owner:'Marketing Operations'},
 'MKT-STR-001':{deliverable:'Evidence-linked market and competitor assessment',inputs:['dated market sources','competitive products','market boundaries'],steps:['Separate confirmed facts from hypotheses','Cluster market signals by audience and technology','Score opportunities against portfolio capability and evidence quality'],checks:['Every market assertion cites its source','Unverified claims flagged'],metrics:['opportunity score','signal freshness'],owner:'Strategy & Intelligence'},
 'MKT-ANA-001':{deliverable:'Measurement specification and attribution proposal',inputs:['approved KPI definitions','read-only marketing events','baseline period'],steps:['Define metric numerator and denominator','Document attribution and exclusion logic','Compare observed versus baseline and uncertainty'],checks:['No fabricated metric values','Source and sampling window present'],metrics:['conversion rate','cost per qualified lead'],owner:'Analytics'},
 'MKT-PM-001':{deliverable:'Product-positioning and segment-fit brief',inputs:['authoritative SKU and claims','intended use','approved product positioning'],steps:['Map technology differentiators to user problems','Identify customer segments and objections','Flag regulatory and evidence constraints per claim'],checks:['No invented product specifications','Claims route through scientific review'],metrics:['product qualified inquiries','message adoption'],owner:'Product Marketing'},
 'MKT-GROWTH-001':{deliverable:'Controlled growth experiment design',inputs:['baseline funnel data','target audience consent','channel budget'],steps:['State testable hypothesis and control','Specify eligibility and success threshold','Propose budget cap and stopping rule'],checks:['No automatic ad spending','No unauthorized audience exports'],metrics:['lead acquisition cost','experiment lift'],owner:'Growth Marketing'},
 'MKT-CRM-001':{deliverable:'Consent-aware lifecycle and lead nurturing design',inputs:['documented contact consent','lead lifecycle definitions','retention rules'],steps:['Segment records on approved fields','Specify nurture cadence and suppression criteria','Define opt-out and lifecycle transitions'],checks:['Consent proof required','No customer messages sent automatically'],metrics:['MQL to SQL progression','opt-out rate'],owner:'CRM Marketing'},
 'MKT-CONT-001':{deliverable:'Source-referenced content brief and editorial package',inputs:['product truth','scientific claim citations','approved positioning'],steps:['Draft hook, audience pain point and key message','Build channel-specific outline and supporting references','Route for scientific and brand approval'],checks:['No unsupported efficacy claims','Publication remains human gated'],metrics:['content engagement','qualified inquiries'],owner:'Content & Communications'},
 'MKT-SOC-001':{deliverable:'Moderated social engagement and response recommendations',inputs:['approved channel policy','community signals','brand language rules'],steps:['Classify discussion and audience intent','Propose non-committal response options','Escalate technical, adverse and legal claims'],checks:['No autonomous posting','Sensitive inquiries escalated'],metrics:['response quality','qualified community leads'],owner:'Social & Community'},
 'MKT-CREATIVE-001':{deliverable:'Brand-safe creative concept and production brief',inputs:['brand master','approved claims','asset rights'],steps:['Define visual hierarchy and layouts','Create concepts and variant briefs','Specify licensing and accessibility checks'],checks:['No unsupported visual claims','Human brand approval before distribution'],metrics:['creative engagement','asset acceptance'],owner:'Creative Studio'},
 'MKT-BRAND-001':{deliverable:'Brand compliance assessment',inputs:['versioned brand master','approved logo assets','channel rules'],steps:['Check visual and verbal consistency','Detect prohibited or ambiguous statements','Document remediations and reviewer decision'],checks:['Authoritative brand version required','Brand approval cannot be self-issued'],metrics:['brand violations','review turnaround'],owner:'Brand Director'},
 'MKT-EVENT-001':{deliverable:'Event program and measurable follow-up plan',inputs:['verified event details','speaker approvals','event budget'],steps:['Define persona and event objectives','Plan booth, sessions, lead qualification and logistics','Describe consent-aware handoff to lifecycle team'],checks:['No invented speaker confirmations','Consent required before outreach'],metrics:['qualified event leads','event influenced opportunities'],owner:'Events'},
 'MKT-SCI-001':{deliverable:'Scientific claims and compliance evidence dossier',inputs:['primary scientific publications','regulatory status records','approved intended use'],steps:['Extract discrete product and clinical claims','Map each claim to original sources and applicability','Classify supported, uncertain and unsupported claims for human review'],checks:['No automatic clinical or regulatory certification','Scientific human approval required'],metrics:['unsupported claims detected','evidence coverage'],owner:'Scientific & Compliance'}
};
export function createMarketingWorkPackage(agentId:string,raw:unknown):MarketingWorkPackage{
 if(!AGENT_ROSTER.some(m=>m.id===agentId))throw new Error('Unknown agent work package owner');
 const playbook=PLAYBOOKS[agentId];if(!playbook)throw new Error('Missing agent domain playbook');
 const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
 const text=(value:unknown,max=250):string|null=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):null;
 const ctx=input.trendContext&&typeof input.trendContext==='object'?input.trendContext as {topics?:unknown}:null;
 const topics=Array.isArray(ctx?.topics)?ctx.topics.slice(0,5):[];
 const authority=input.authorityContext&&typeof input.authorityContext==='object'?
    input.authorityContext as Record<string,unknown>:{};
 const product=authority.source==='TENANT_MARKETING_CATALOG'&&authority.product&&typeof authority.product==='object'?
    authority.product as Record<string,unknown>:null;
 const objective=authority.source==='TENANT_MARKETING_CATALOG'&&authority.objective&&typeof authority.objective==='object'?
    authority.objective as Record<string,unknown>:null;
 const catalog={
    source:authority.source==='TENANT_MARKETING_CATALOG'?'TENANT_MARKETING_CATALOG':null,
    product:product&&typeof product.id==='string'&&typeof product.code==='string'&&typeof product.name==='string'?
      {id:product.id,code:product.code,name:product.name,vendor:typeof product.vendor==='string'?product.vendor:null}:null,
    objective:objective&&typeof objective.id==='string'&&typeof objective.name==='string'?
      {id:objective.id,name:objective.name}:null,
    scientificClaimsVerified:false as const,regulatoryApprovalVerified:false as const
 };
 const references:{topic:string;url:string;verification:'UNVERIFIED'}[]=[];
 for(const topic of topics){
  if(!topic||typeof topic!=='object')continue;
  const t=topic as {topic?:unknown;evidence?:unknown};
  if(!Array.isArray(t.evidence))continue;
  for(const cited of t.evidence.slice(0,3)){
   if(!cited||typeof cited!=='object')continue;
   const source=cited as {url?:unknown};
   const url=text(source.url,2000);
   if(url&&url.startsWith('https://')&&references.length<15)references.push({topic:text(t.topic)??'Unclassified',url,verification:'UNVERIFIED'});
  }
 }
 return{agentId,deliverable:playbook.deliverable,objective:text(input.requestedOutcome??input.objective)??'Define campaign objective',
  market:text(input.market),audience:text(input.targetAudience),
  requiredInputs:[...playbook.inputs],analysisSteps:[...playbook.steps],acceptanceChecks:[...playbook.checks],
  successIndicators:[...playbook.metrics],reviewOwner:playbook.owner,blockedOn:[...playbook.inputs],
  references,catalog,executable:false};
}
