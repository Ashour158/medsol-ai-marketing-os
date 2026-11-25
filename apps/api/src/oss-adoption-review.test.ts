import {describe,expect,it} from 'vitest';
import {AGENT_ROSTER,AgentRegistry,AgentRuntime,MarketingDomainAgent,reviewSearchDiscovery} from '@medsol/agent-runtime';
const fixed=new Date('2026-11-26T00:00:00Z');
const schema={
 organizationId:'tenant-a',brandId:'brand-a',sourceReference:'internal:reviewed-site-1',
 sourceReviewed:true,collectionPermitted:true,organizationName:'Example Science',
 websiteUrl:'https://example.org/',description:'Scientific research services.',
 sameAs:['https://example.net/profile','https://example.net/profile'],
 breadcrumb:{title:'Research',url:'https://example.org/research',
  collectionTitle:'Services',collectionUrl:'https://example.org/services'}
};
const discovery={organizationId:'tenant-a',brandId:'brand-a',observations:[],structuredDataDraft:schema};
const lead={organizationId:'tenant-a',brandId:'brand-a',sourceReference:'internal:qualification-1',
 sourceReviewed:true,purposeAllowed:true,bant:{budget:4,authority:4,need:5,timeline:4},
 icp:{industry:2,companySize:2,role:2,geography:2}};
async function run(agentId:string,input:Record<string,unknown>){
 const manifest=AGENT_ROSTER.find(x=>x.id===agentId)!;
 const registry=new AgentRegistry();
 registry.register(new MarketingDomainAgent(manifest));
 return new AgentRuntime(registry).execute(agentId,{
  executionId:'offline-adoption',organizationId:'tenant-a',correlationId:'adoption-review',
  capabilities:[manifest.capabilities[0]!],input:{requestedOutcome:'Review only',...input}
 });
}
describe('Licensed open-source adoption under canonical agent governance',()=>{
 it('creates real organization and breadcrumb JSON-LD with no claim of visibility or publishing',()=>{
  const result=reviewSearchDiscovery('tenant-a',discovery,fixed);
  expect(result.structuredDataDraft).toMatchObject({
   independentlyVerified:false,websiteOwnershipVerified:false,publicationAuthorized:false,
   searchVisibilityVerified:false,externalEffectsAuthorized:false,humanApprovalRequired:true,
   schemas:[
    {'@context':'https://schema.org','@type':'Organization',name:'Example Science',
     sameAs:['https://example.net/profile']},
    {'@type':'BreadcrumbList',itemListElement:[
      {position:1,name:'Example Science',item:'https://example.org/'},
      {position:2,name:'Services',item:'https://example.org/services'},
      {position:3,name:'Research',item:'https://example.org/research'}
    ]}
   ]
  });
  expect(result.reviewedCount).toBe(0);
  expect(result.aiAnswerMentionRatePercent).toBeNull();
 });
 it('rejects cross-tenant, cross-brand, unsupported fields, unreviewed sources and unsafe links',()=>{
  for(const change of [
   {organizationId:'tenant-b'},{brandId:'brand-b'},{sourceReviewed:false},
   {collectionPermitted:false},{email:'private@example.org'},
   {organizationName:'<script>bad</script>'},{websiteUrl:'http://example.org'},
   {websiteUrl:'https://user:password@example.org/'},{websiteUrl:'https://127.0.0.1/'},
   {websiteUrl:'https://example.org/?token=secret'},
   {breadcrumb:{title:'Foreign',url:'https://other.example/research'}},
   {breadcrumb:{title:'Same',url:'https://example.org/'}},
   {sameAs:Array.from({length:11},()=> 'https://example.org/')}
  ])expect(()=>reviewSearchDiscovery('tenant-a',{...discovery,structuredDataDraft:{...schema,...change}},fixed)).toThrow();
 });
 it('runs adopted SEO generators through the original Strategy agent with explicit approval',async()=>{
  const result=await run('MKT-STR-001',{searchDiscoveryInput:discovery});
  expect(result.approvalRequired).toBe(true);
  expect(result.payload).toMatchObject({controls:{externalEffectPermitted:false},
   expansionReview:{structuredDataDraft:{publicationAuthorized:false,externalEffectsAuthorized:false}}});
 });
 it('computes the adapted BANT/ICP rubric through the original Growth agent; no CRM action',async()=>{
  const result=await run('MKT-GROWTH-001',{leadQualificationInput:lead});
  expect(result.approvalRequired).toBe(true);
  expect(result.payload).toMatchObject({controls:{externalEffectPermitted:false},
   expansionReview:{engineId:'E09',workflowId:'WF33',status:'REVIEW_REQUIRED',
    bantTotal:17,icpTotal:8,priority:'HOT',fitTier:'A',suggestedReview:'SALES_OWNER_REVIEW',
    independentlyVerified:false,consentVerified:false,crmWriteAuthorized:false,
    externalEffectsAuthorized:false}});
 });
 it('keeps missing data unknown, blocks revoked purpose and rejects malformed scores or identifiers',async()=>{
  const missing=await run('MKT-GROWTH-001',{leadQualificationInput:{...lead,bant:{...lead.bant,budget:null}}});
  expect(missing.payload).toMatchObject({expansionReview:{status:'INSUFFICIENT_EVIDENCE',bantTotal:null,priority:null}});
  const blocked=await run('MKT-GROWTH-001',{leadQualificationInput:{...lead,purposeAllowed:false}});
  expect(blocked.payload).toMatchObject({expansionReview:{status:'BLOCKED',bantTotal:null,icpTotal:null}});
  for(const change of [{organizationId:'tenant-b'},{email:'private@example.org'},
   {bant:{...lead.bant,budget:6}},{icp:{...lead.icp,role:-1}},
   {bant:{...lead.bant,budget:'5'}}]){
   await expect(run('MKT-GROWTH-001',{leadQualificationInput:{...lead,...change}})).rejects.toThrow();
  }
 });
});
