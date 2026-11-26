import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {MarketingLearningService} from './marketing-learning.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const content='Long read sequencing in medical genomics can reveal structural '+ 
 'variants, repeat expansions and transcript isoforms. This summary is not '+ 
 'scientifically independently verified and must remain subject to reviewer '+ 
 'approval prior to marketing claims. Provisional methods and findings should '+ 
 'be interpreted alongside peer reviewed source literature.';
describe('R3-H authoritative knowledge fabric integration',()=>{
 it.skipIf(!enabled)('enforces tenant RLS, maker-checker, source ACL, hybrid evidence, learning and revoke scrub',async()=>{
  const db=new PrismaClient(),org='r3h-'+randomUUID(),
   other='r3h-other-'+randomUUID(),
   creator='r3h-maker-'+randomUUID(),
   checker='r3h-checker-'+randomUUID(),
   subA='subject-'+randomUUID(),subB='subject-'+randomUUID();
  const id=(userId:string,subject:string,organizationId=org)=>({
   userId,subject,organizationId,role:'ADMIN',email:userId+'@example.invalid'
  });
  const author=id(creator,subA),reviewer=id(checker,subB);
  const sourceKey='research-review-'+randomUUID();
  const input={sourceKey,title:'Long read genomic research reference',
   sourceUrl:'https://example.org/long-read-review',
   publishedAt:'2026-11-01T00:00:00.000Z',
   expiresAt:'2026-12-30T00:00:00.000Z',
   text:content,accessMode:'AGENT_SCOPED',
   agentScope:['MKT-SCI-001','MKT-STR-001']};
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'R3H knowledge test'},{id:other,name:'Foreign R3H knowledge'}]});
   await db.user.createMany({data:[
    {id:creator,organizationId:org,email:author.email,name:'Maker',
     role:'ADMIN',oidcSubject:subA},
    {id:checker,organizationId:org,email:reviewer.email,name:'Reviewer',
     role:'ADMIN',oidcSubject:subB}]});
   const service=new MarketingLearningService(db as any);
   const ingested=await service.ingestKnowledge(org,author,input);
   expect(ingested).toMatchObject({status:'QUARANTINED',replayed:false,
    independentlyVerified:false,accessMode:'AGENT_SCOPED'});
   expect((await service.ingestKnowledge(org,author,input)).replayed).toBe(true);
   await expect(service.ingestKnowledge(org,author,{
    ...input,title:'Tampered with same source key'}))
    .rejects.toThrow('Immutable source key');
   await expect(service.ingestKnowledge(other,author,{
    ...input,sourceKey:'foreign-'+randomUUID()}))
    .rejects.toThrow('tenant knowledge authority');
   await expect(service.ingestKnowledge(org,id(checker,'wrong-sub'),{
    ...input,sourceKey:'forged-'+randomUUID()}))
    .rejects.toThrow('Active matching');
   await expect(service.reviewKnowledge(org,author,ingested.id,
    'REVIEW','Sufficient curation to enter retrieval')).rejects.toThrow('Independent');
   const before=await service.contextForAgent(org,'MKT-SCI-001','sequencing genomic');
   expect(before.results).toHaveLength(0);
   expect((await service.reviewKnowledge(org,reviewer,ingested.id,
    'REVIEW','Reviewed local study reference and source provenance')).status)
    .toBe('REVIEWED');
   const allowed=await service.contextForAgent(org,'MKT-SCI-001','genomic sequencing');
   expect(allowed.results.length).toBeGreaterThan(0);
   expect(allowed.results[0]).toMatchObject({
    documentId:ingested.id,independentlyVerified:false,
    untrustedSourceText:true,externalEffectsAuthorized:false});
   expect(allowed.results[0]?.citationRef).toMatch(/^kb:/);
   const denied=await service.contextForAgent(org,'MKT-CRM-001','genomic sequencing');
   expect(denied.results).toHaveLength(0);
   const foreign=await service.contextForAgent(other,'MKT-SCI-001','genomic sequencing');
   expect(foreign.results).toHaveLength(0);
   await expect(service.contextForAgent(org,'UNREGISTERED','genomic sequencing'))
    .rejects.toThrow('Unknown canonical agent');
   const userResult=await service.searchKnowledge(org,reviewer,'genomic sequencing');
   expect(userResult.results.length).toBeGreaterThan(0);
   await expect(service.searchKnowledge(other,reviewer,'genomic sequencing'))
    .rejects.toThrow('tenant knowledge authority');
   // Immutable content/attestation cannot be rewritten behind reviewer back.
   await expect(db.knowledgeChunk.updateMany({where:{
    organizationId:org,documentId:ingested.id},data:{content:'TAMPERED'}}))
    .rejects.toThrow();
   const promoted=await service.promoteKnowledgeSignal(org,author,ingested.id,{
    topic:'Long-read sequencing',sector:'Genomics'});
   expect(promoted).toMatchObject({status:'QUARANTINED',
    skillReleased:false,replayed:false});
   const signal=await db.learningSignal.findFirstOrThrow({where:{
    organizationId:org,id:promoted.signalId}});
   expect(signal.knowledgeDocumentId).toBe(ingested.id);
   await expect(service.verify(org,creator,promoted.signalId))
    .rejects.toThrow('Source creator');
   await service.verify(org,checker,promoted.signalId);
   const proposal=await service.propose(org,reviewer.userId,{
    signalId:promoted.signalId,agentId:'MKT-STR-001',
    skillKey:'ASSESS_MARKET',
    rationale:'Promote reviewed learning as a candidate skill, pending regression'});
   expect(proposal.status).toBe('PROPOSED');
   expect((await service.trendBrief(org,'Genomics')).topics.length).toBe(1);
   const erased=await service.revokeKnowledge(org,reviewer,ingested.id,
    'Source provenance withdrawn; stop retrieval and linked learning');
   expect(erased).toMatchObject({status:'REVOKED',withdrawnSignals:1});
   expect((await service.contextForAgent(org,'MKT-SCI-001','genomic sequencing')).results)
    .toHaveLength(0);
   expect((await service.trendBrief(org,'Genomics')).topics).toHaveLength(0);
   const chunks=await db.knowledgeChunk.findMany({where:{
    organizationId:org,documentId:ingested.id}});
   expect(chunks.every(c=>c.content===''&&c.vector.length===0&&c.terms.length===0)).toBe(true);
   expect((await db.learningSignal.findFirstOrThrow({where:{id:promoted.signalId}})).status)
    .toBe('REVOKED');
   expect((await db.agentSkillProposal.findFirstOrThrow({where:{id:proposal.id}})).status)
    .toBe('WITHDRAWN_SOURCE_REVOKED');
   await expect(service.propose(org,reviewer.userId,{
    signalId:promoted.signalId,agentId:'MKT-STR-001',
    skillKey:'ASSESS_MARKET',rationale:'Must be denied after revocation'}))
    .rejects.toThrow('reviewed');
   expect((await service.revokeKnowledge(org,reviewer,ingested.id,
    'Repeat revocation is idempotent')).replayed).toBe(true);
   // A restricted SQL role must see nothing outside its RLS tenant context.
   const role='r3h_role_'+randomUUID().replaceAll('-','').slice(0,18);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   try{
    for(const name of ['KnowledgeDocument','KnowledgeChunk'])
     await db.$executeRawUnsafe('GRANT SELECT ON "'+name+'" TO "'+role+'"');
    const result=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     const count=async()=>({
      documents:Number((await tx.$queryRaw<Array<{n:bigint}>>`
       SELECT count(*)::bigint AS n FROM "KnowledgeDocument"`)[0]?.n),
      chunks:Number((await tx.$queryRaw<Array<{n:bigint}>>`
       SELECT count(*)::bigint AS n FROM "KnowledgeChunk"`)[0]?.n)
     });
     const none=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
     const own=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${other}, true)`;
     const foreign=await count();
     return{none,own,foreign};
    });
    expect(result.none).toEqual({documents:0,chunks:0});
    expect(result.own.documents).toBe(1);
    expect(result.own.chunks).toBeGreaterThan(0);
    expect(result.foreign).toEqual({documents:0,chunks:0});
   }finally{
    for(const name of ['KnowledgeDocument','KnowledgeChunk'])
     await db.$executeRawUnsafe('REVOKE SELECT ON "'+name+'" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE "'+role+'"');
   }
   const governedInput={...input,sourceKey:'governed-'+randomUUID(),expiresAt:new Date(Date.now()+30*86400000).toISOString(),
    governedImport:{collectionPermitted:true,noPersonalData:true,permissionReference:'internal:source-rights/license-record',
     rightsBasis:'LICENSED_CONTENT',scope:'METADATA_ONLY'}};
   const governed=await service.ingestKnowledge(org,author,governedInput);
   expect(governed).toMatchObject({status:'QUARANTINED',sourceType:'GOVERNED_IMPORT',governedSourceEvidence:{
    legalRightsVerified:false,actualNetworkRequests:0,externalEffectsAuthorized:false}});
   expect(await service.ingestKnowledge(org,author,governedInput)).toMatchObject({id:governed.id,replayed:true});
   await expect(service.ingestKnowledge(org,author,{...governedInput,governedImport:{...governedInput.governedImport,rightsBasis:'OWNER_PERMISSION'}})).rejects.toThrow('Immutable source key');
   await expect(service.ingestKnowledge(org,author,{...governedInput,sourceKey:'denied-'+randomUUID(),governedImport:{...governedInput.governedImport,collectionPermitted:false}})).rejects.toThrow('permitted collection');
   await expect(service.reviewKnowledge(org,author,governed.id,'REVIEW','Self review is not allowed')).rejects.toThrow('Independent');
   expect(await service.reviewKnowledge(org,reviewer,governed.id,'REVIEW','Independently reviewed declared source rights and provenance')).toMatchObject({status:'REVIEWED',independentlyVerified:false});
   await expect(db.knowledgeDocument.update({where:{id:governed.id},data:{governedSourceEvidence:{legalRightsVerified:true}}})).rejects.toThrow();
   expect(await db.modelUsage.count({where:{organizationId:org}})).toBe(0);
   expect(await db.outboxEvent.count({where:{
    organizationId:org,eventType:'KnowledgeSourceRevokedInternal'}})).toBe(1);
   const businessProfile={name:'Synthetic Med Research',industry:'Life sciences',offerings:'Proteomics reagents and instruments',audience:'Research laboratories',territories:'Egypt',differentiators:'Technical support and training'};
   const profileInput={sourceKey:'business-profile-'+randomUUID(),businessProfile,sourceUrl:'https://example.invalid/business-profile',expiresAt:new Date(Date.now()+60*86400000).toISOString(),accessMode:'AGENT_SCOPED',agentScope:['MKT-BRAND-001']};
   const profile=await service.ingestKnowledge(org,author,profileInput);
   expect(profile).toMatchObject({status:'QUARANTINED',chunkCount:1});
   expect(await service.ingestKnowledge(org,author,profileInput)).toMatchObject({id:profile.id,replayed:true});
   await expect(service.ingestKnowledge(org,author,{...profileInput,businessProfile:{...businessProfile,territories:'Other'}})).rejects.toThrow('Immutable source key');
   await expect(service.ingestKnowledge(org,author,{...profileInput,sourceKey:'business-profile-'+randomUUID(),businessProfile:undefined,title:'Spoofed profile',text:content})).rejects.toThrow('Reserved');
   expect((await service.knowledgeDocuments(org,reviewer)).find(d=>d.id===profile.id)).toMatchObject({businessProfile,profileReviewStatus:'QUARANTINED',profileAuthoritative:false});
   expect((await service.contextForAgent(org,'MKT-BRAND-001','proteomics reagents')).results).toHaveLength(0);
   await expect(service.reviewKnowledge(org,author,profile.id,'REVIEW','Do not permit self-review of structured profile')).rejects.toThrow('Independent');
   await service.reviewKnowledge(org,reviewer,profile.id,'REVIEW','Independent review of the synthetic business profile source');
   expect((await service.knowledgeDocuments(org,reviewer)).find(d=>d.id===profile.id)).toMatchObject({businessProfile,profileReviewStatus:'REVIEWED',profileAuthoritative:false});
   expect((await service.contextForAgent(org,'MKT-BRAND-001','proteomics reagents')).results.some(x=>x.documentId===profile.id)).toBe(true);
   expect((await service.contextForAgent(org,'MKT-CRM-001','proteomics reagents')).results).toHaveLength(0);
   await expect(service.knowledgeDocuments(other,reviewer)).rejects.toThrow('tenant knowledge authority');
   await service.revokeKnowledge(org,reviewer,profile.id,'Synthetic profile withdrawn and no longer available');
   const revoked=(await service.knowledgeDocuments(org,reviewer)).find(d=>d.id===profile.id);
   expect(revoked).toMatchObject({status:'REVOKED'});expect(revoked).not.toHaveProperty('businessProfile');
   expect((await service.contextForAgent(org,'MKT-BRAND-001','proteomics reagents')).results).toHaveLength(0);
  }finally{await db.$disconnect();}
 },90000);
 it('centralizes OIDC authority for evidence, learning and zero-network search',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/learning/knowledge'))
   .toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('POST','/marketing/learning/knowledge/search'))
   .toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('POST','/marketing/learning/knowledge'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST',
   '/marketing/learning/knowledge/release/review')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST',
   '/marketing/learning/knowledge/release/revoke')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST',
   '/marketing/learning/knowledge/release/promote')).toBe('MANAGE_TENANT');
  expect(()=>permissionForMarketingRoute('POST',
   '/marketing/learning/knowledge/external-publish')).toThrow('permission registry');
 });
});
