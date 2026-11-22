import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {MarketingLearningService} from './marketing-learning.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const corpus='Single molecule proteomics review compares peptide fingerprinting, '+
 'target protein identification and longitudinal patient sample protocols. '+
 'This synthetic scientific reference is suitable for internal research '+
 'training only and MUST NOT be represented as clinically validated.';
const otherCorpus='Long read sequencing research discusses genome variants and '+
 'orthogonal proteomics validation requirements. Scientific studies '+
 'need independent review before marketing publication or clinical use.';

describe('R3-I source-bound agent memory, document graph and retrieval quality governance',()=>{
 it.skipIf(!enabled)('T07-025 checks maker/checker, agent graph ACL, memory TTL, evaluation, feedback and source kill switch',async()=>{
  const db=new PrismaClient();
  const org='r3i-'+randomUUID(),other='r3i-other-'+randomUUID();
  const maker='maker-'+randomUUID(),checker='checker-'+randomUUID();
  const sub1='sub-'+randomUUID(),sub2='sub-'+randomUUID();
  const identity=(userId:string,subject:string,organizationId=org)=>({
   organizationId,userId,subject,role:'ADMIN',email:userId+'@example.invalid'});
  const author=identity(maker,sub1),reviewer=identity(checker,sub2);
  const future=new Date(Date.now()+20*86400000).toISOString();
  const memoryExpiry=new Date(Date.now()+4*86400000).toISOString();
  const svc=new MarketingLearningService(db as any);
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'R3I learning'},{id:other,name:'R3I foreign'}]});
   await db.user.createMany({data:[
    {id:maker,organizationId:org,email:author.email,oidcSubject:sub1,
     name:'Memory maker',role:'ADMIN'},
    {id:checker,organizationId:org,email:reviewer.email,oidcSubject:sub2,
     name:'Memory checker',role:'ADMIN'}]});
   const source=await svc.ingestKnowledge(org,author,{
    sourceKey:'r3i-source-'+randomUUID(),title:'Synthetic proteomics source',
    text:corpus,accessMode:'AGENT_SCOPED',
    agentScope:['MKT-SCI-001','MKT-STR-001'],expiresAt:future,
    sourceUrl:'https://example.org/r3i-proteomics'});
   const target=await svc.ingestKnowledge(org,author,{
    sourceKey:'r3i-source-'+randomUUID(),title:'Synthetic sequencing source',
    text:otherCorpus,accessMode:'AGENT_SCOPED',
    agentScope:['MKT-SCI-001'],expiresAt:future,
    sourceUrl:'https://example.org/r3i-sequencing'});
   await svc.reviewKnowledge(org,reviewer,source.id,'REVIEW',
    'Independent validation of manually submitted reference');
   await svc.reviewKnowledge(org,reviewer,target.id,'REVIEW',
    'Independent validation of second manually curated source');
   await expect(svc.proposeKnowledgeRelation(other,author,{
    fromDocumentId:source.id,toDocumentId:target.id,
    relationType:'REPORTS_CONFLICT',note:'Relationship must not cross tenant'}))
    .rejects.toThrow('tenant knowledge authority');
   const edge=await svc.proposeKnowledgeRelation(org,author,{
    fromDocumentId:source.id,toDocumentId:target.id,
    relationType:'METHODOLOGICALLY_RELATED',
    note:'Both sources compare emerging scientific measurement methods'});
   expect(edge).toMatchObject({status:'PROPOSED',scientificTruthVerified:false});
   expect((await svc.graphForReviewer(org,reviewer,source.id)).edges).toHaveLength(0);
   await expect(svc.reviewKnowledgeRelation(org,author,edge.edgeId,
    'APPROVE','Trying to bypass graph reviewer')).rejects.toThrow('Independent');
   await svc.reviewKnowledgeRelation(org,reviewer,edge.edgeId,
    'APPROVE','Both sources assessed as methodologically related');
   expect((await svc.graphForReviewer(org,author,source.id)).edges)
    .toMatchObject([{edgeId:edge.edgeId,scientificTruthVerified:false}]);
   const memory=await svc.proposeAgentMemory(org,author,{
    documentId:source.id,agentId:'MKT-SCI-001',
    memoryKey:'r3i-memory-'+randomUUID(),
    content:'Research reminder: this proteomics methodology is not '+
     'independently validated for diagnostic claims and requires '+
     'scientific quality review before marketing materials.',
    expiresAt:memoryExpiry});
   expect(memory.status).toBe('PROPOSED');
   await expect(svc.reviewAgentMemory(org,author,memory.memoryId,
    'APPROVE','Attempt self approval for persistent source memory'))
    .rejects.toThrow('Independent');
   await expect(svc.proposeAgentMemory(other,author,{
    documentId:source.id,agentId:'MKT-SCI-001',
    memoryKey:'r3i-memory-'+randomUUID(),
    content:'Mismatched tenant test content with adequate explanation',
    expiresAt:memoryExpiry})).rejects.toThrow('tenant knowledge authority');
   await svc.reviewAgentMemory(org,reviewer,memory.memoryId,
    'APPROVE','Reviewed scoped short-lived evidence reminder');
   const science=await svc.contextForAgent(org,'MKT-SCI-001','proteomics');
   const operatorPreview=await svc.previewAgentContext(org,reviewer,{
    agentId:'MKT-SCI-001',query:'proteomics'});
   expect(operatorPreview).toMatchObject({
    agentId:'MKT-SCI-001',inspectionOnly:true,
    realModelInvocations:0,mcpCalls:0,a2aCalls:0,
    autonomousMemoryWrites:0,skillPromotions:0,
    externalEffectsAuthorized:false,sourceReviewIsScientificTruth:false
   });
   expect(operatorPreview.memories).toMatchObject([{
    memoryId:memory.memoryId,humanReviewed:true,independentlyVerified:false
   }]);
   expect(operatorPreview.relations).toMatchObject([{
    edgeId:edge.edgeId,scientificTruthVerified:false
   }]);
   await expect(svc.previewAgentContext(other,reviewer,{
    agentId:'MKT-SCI-001',query:'proteomics'}))
    .rejects.toThrow(/tenant knowledge authority/);
   await expect(svc.previewAgentContext(org,{
    ...reviewer,subject:'forged-context-identity'},{
    agentId:'MKT-SCI-001',query:'proteomics'}))
    .rejects.toThrow(/matching tenant OIDC/);
   await expect(svc.previewAgentContext(org,reviewer,{
    agentId:'FAKE-AGENT',query:'proteomics'}))
    .rejects.toThrow(/Canonical agent/);
   expect(science.memories).toMatchObject([{
    memoryId:memory.memoryId,humanReviewed:true,independentlyVerified:false}]);
   expect(science.relations).toMatchObject([{
    edgeId:edge.edgeId,scientificTruthVerified:false}]);
   const strategy=await svc.contextForAgent(org,'MKT-STR-001','proteomics');
   expect(strategy.memories).toHaveLength(0);
   expect(strategy.relations).toHaveLength(0);
   const foreign=await svc.contextForAgent(other,'MKT-SCI-001','proteomics');
   expect(foreign.memories).toHaveLength(0);
   expect(foreign.relations).toHaveLength(0);
   await expect(svc.proposeAgentMemory(org,author,{
    documentId:source.id,agentId:'MKT-CMO-001',
    memoryKey:'r3i-memory-'+randomUUID(),
    content:'Unauthorized CMO memory may not read scientific source',
    expiresAt:memoryExpiry})).rejects.toThrow('source must be reviewed');
   await expect(db.agentKnowledgeMemory.updateMany({where:{
    organizationId:org,id:memory.memoryId},data:{content:'tampered'}}))
    .rejects.toThrow();
   const feedback=await svc.recordKnowledgeFeedback(org,reviewer,{
    query:'proteomics',chunkId:science.results[0]!.chunkId,
    label:'RELEVANT',reason:'Research topic matches the reviewed source'});
   expect(feedback.automaticRankingChange).toBe(false);
   const summary=await svc.feedbackSummary(org,author);
   expect(summary.labels).toMatchObject({RELEVANT:1,MISLEADING:0});
   const evalResult=await svc.evaluateKnowledgeRetrieval(org,reviewer,{
    k:5,cases:[{id:'r3i-case-001',query:'single molecule proteomics',
     relevantDocumentIds:[source.id]}]});
   expect(evalResult).toMatchObject({cases:1,hits:1,
    modelOrSkillPromotionAuthorized:false,independentlyVerified:false,
    providerRequestsMade:0});
   expect(evalResult.meanReciprocalRank).toBe(1);
   const revoked=await svc.revokeKnowledge(org,reviewer,source.id,
    'Emergency withdrawal of original research and all dependent memory');
   expect(revoked).toMatchObject({status:'REVOKED',scrubbedMemories:1,
    revokedGraphEdges:1});
   const post=await svc.contextForAgent(org,'MKT-SCI-001','proteomics');
   const postPreview=await svc.previewAgentContext(org,reviewer,{
    agentId:'MKT-SCI-001',query:'proteomics'});
   expect(postPreview.memories).toHaveLength(0);
   expect(postPreview.relations).toHaveLength(0);
   expect(post.memories).toHaveLength(0);
   expect(post.relations).toHaveLength(0);
   expect((await db.agentKnowledgeMemory.findFirstOrThrow({
    where:{id:memory.memoryId}})).content).toBe('');
   expect((await db.knowledgeRelation.findFirstOrThrow({
    where:{id:edge.edgeId}})).note).toBe('');
   await expect(svc.evaluateKnowledgeRetrieval(org,reviewer,{
    cases:[{id:'r3i-case-002',query:'proteomics',
     relevantDocumentIds:[source.id]}]})).rejects.toThrow('reviewed');
   expect((await svc.revokeAgentMemory(org,reviewer,memory.memoryId,
    'Repeated explicit memory revocation')).replayed).toBe(true);
   expect((await svc.revokeKnowledgeRelation(org,reviewer,edge.edgeId,
    'Repeated explicit edge revocation')).replayed).toBe(true);
   const sqlRole='r3i_role_'+randomUUID().replaceAll('-','').slice(0,16);
   await db.$executeRawUnsafe('CREATE ROLE "'+sqlRole+'" NOLOGIN');
   try{
    for(const table of ['KnowledgeRelation','AgentKnowledgeMemory'])
     await db.$executeRawUnsafe('GRANT SELECT ON "'+table+'" TO "'+sqlRole+'"');
    const out=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+sqlRole+'"');
     const count=async()=>({
      graph:Number((await tx.$queryRaw<Array<{n:bigint}>>`
       SELECT count(*)::bigint AS n FROM "KnowledgeRelation"`)[0]?.n),
      memory:Number((await tx.$queryRaw<Array<{n:bigint}>>`
       SELECT count(*)::bigint AS n FROM "AgentKnowledgeMemory"`)[0]?.n)});
     const none=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
     const own=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${other}, true)`;
     const foreign=await count();
     return{none,own,foreign};
    });
    expect(out).toEqual({none:{graph:0,memory:0},
     own:{graph:1,memory:1},foreign:{graph:0,memory:0}});
   }finally{
    for(const table of ['KnowledgeRelation','AgentKnowledgeMemory'])
     await db.$executeRawUnsafe('REVOKE SELECT ON "'+table+'" FROM "'+sqlRole+'"');
    await db.$executeRawUnsafe('DROP ROLE "'+sqlRole+'"');
   }
   expect(await db.modelUsage.count({where:{organizationId:org}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
 it('restricts graph, memory and feedback endpoints to existing OIDC permissions',()=>{
  for(const route of ['/marketing/learning/graph',
   '/marketing/learning/memories',
   '/marketing/learning/knowledge/feedback',
   '/marketing/learning/knowledge/evaluate'])
   expect(permissionForMarketingRoute('POST',route)).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST',
   '/marketing/learning/knowledge/agent-context-preview')).toBe('READ_AUDIT');
  expect(()=>permissionForMarketingRoute('POST',
   '/marketing/learning/knowledge/agent-context-preview/send')).toThrow('permission registry');
  expect(permissionForMarketingRoute('GET','/marketing/learning/memories')).toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('GET','/marketing/learning/graph/doc-001')).toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('POST','/marketing/learning/memories/xyz/review'))
   .toBe('MANAGE_TENANT');
  expect(()=>permissionForMarketingRoute('POST','/marketing/learning/graph/effects/publish'))
   .toThrow('permission registry');
 });
});
