import {Prisma} from '@prisma/client';
import {hasMarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';
import {chunkKnowledge,knowledgeTerms,sparseKnowledgeVector,knowledgeCosine,
 evidenceScore,knowledgeSourceDigest} from './knowledge-retrieval.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service.js';
import { AGENT_ROSTER } from '@medsol/agent-runtime';

type SignalInput={topic:string;sector:string;sourceUrl:string;sourceTitle:string;observedAt:string;sourcePublishedAt?:string;evidence:{summary:string;excerpt?:string}};
function required(value:unknown,name:string,max=1000):string {
 if(typeof value!=='string'||!value.trim()||value.length>max)throw new BadRequestException('Invalid '+name);
 return value.trim();
}
function parseDate(value:string):Date {
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new BadRequestException('Invalid evidence date');
 if(date.getTime()>Date.now()+86400000)throw new BadRequestException('Future evidence date');
 return date;
}
@Injectable()
export class MarketingLearningService {
 constructor(private readonly db:PrismaService){}
 async ingest(organizationId:string,raw:SignalInput){
  const topic=required(raw?.topic,'topic',180),sector=required(raw?.sector,'sector',120);
  const sourceUrl=required(raw?.sourceUrl,'sourceUrl',2000),sourceTitle=required(raw?.sourceTitle,'sourceTitle',300);
  let url:URL;try{url=new URL(sourceUrl)}catch{throw new BadRequestException('Invalid evidence URL')}
  if(url.protocol!=='https:'||url.username||url.password)throw new BadRequestException('Only public HTTPS source references accepted');
  const observedAt=parseDate(required(raw.observedAt,'observedAt',40));
  const sourcePublishedAt=raw.sourcePublishedAt?parseDate(raw.sourcePublishedAt):undefined;
  const summary=required(raw.evidence?.summary,'evidence summary',3000);
  const excerpt=raw.evidence?.excerpt?required(raw.evidence.excerpt,'excerpt',2000):undefined;
  const fingerprint=createHash('sha256').update(JSON.stringify([sourceUrl,topic,sector,sourcePublishedAt?.toISOString()??''])).digest('hex');
  const existing=await this.db.learningSignal.findUnique({where:{organizationId_fingerprint:{organizationId,fingerprint}}});
  if(existing)return{signal:existing,replayed:true};
  try{
   const signal=await this.db.learningSignal.create({data:{id:randomUUID(),organizationId,fingerprint,topic,sector,sourceUrl,sourceTitle,observedAt,...(sourcePublishedAt?{sourcePublishedAt}:{}),evidence:{summary,...(excerpt?{excerpt}:{})},status:'QUARANTINED'}});
   return{signal,replayed:false};
  }catch(error){
   // Preserve unique-key concurrency safety without treating arbitrary DB failures as duplicates.
   if((error as {code?:string})?.code==='P2002'){
    const signal=await this.db.learningSignal.findUnique({where:{organizationId_fingerprint:{organizationId,fingerprint}}});
    if(signal)return{signal,replayed:true};
   }
   throw error;
  }
 }

 // R3-H. This is the single authoritative knowledge curation and learning
 // service. It does not install a second agent memory or truth authority.
 private knowledgeTx<T>(organizationId:string,
  fn:(tx:Prisma.TransactionClient)=>Promise<T>){
  if(!organizationId||organizationId.length>160)
   throw new BadRequestException('Tenant identity required');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async knowledgeActor(tx:Prisma.TransactionClient,org:string,
  identity:VerifiedIdentity,action:'MANAGE_TENANT'|'READ_AUDIT'){
  if(!identity||identity.organizationId!==org||!identity.subject||
   !hasMarketingPermission(identity,action))
   throw new ForbiddenException('Verified tenant knowledge authority required');
  const user=await tx.user.findFirst({where:{
   id:identity.userId,organizationId:org,oidcSubject:identity.subject,
   disabledAt:null},select:{role:true}});
  if(!user||user.role.toUpperCase()!==identity.role.toUpperCase())
   throw new ForbiddenException('Active matching tenant OIDC identity required');
 }
 private knowledgeId(value:unknown,name='identifier'){
  if(typeof value!=='string'||!/^[A-Za-z0-9:_-]{8,160}$/.test(value))
   throw new BadRequestException('Invalid knowledge '+name);
  return value;
 }
 private knowledgeUrl(value:unknown){
  if(value===undefined||value===null||value==='')return null;
  const str=required(value,'sourceUrl',2000);
  let url:URL;try{url=new URL(str)}catch{
   throw new BadRequestException('Invalid HTTPS knowledge source URL');
  }
  if(url.protocol!=='https:'||url.username||url.password||
   !url.hostname||url.hash)
   throw new BadRequestException('Only plain HTTPS provenance URLs allowed');
  // Source is recorded only. This service never fetches URLs.
  return url.toString();
 }
 private knowledgeDate(value:unknown,name:string){
  if(value===undefined||value===null||value==='')return null;
  const raw=required(value,name,40),date=new Date(raw);
  if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1990||
   date.getTime()>Date.now()+2*365*86400000)
   throw new BadRequestException('Invalid '+name);
  return date;
 }
 private knowledgeMeta(row:{
  id:string;sourceKey:string;title:string;sourceUrl:string|null;
  status:string;accessMode:string;agentScope:string[];
  contentDigest:string;createdBy:string;reviewedBy:string|null;
  expiresAt:Date|null;publishedAt:Date|null;
  createdAt:Date;revokedAt:Date|null
 }){
  return{id:row.id,sourceKey:row.sourceKey,title:row.title,
   sourceUrl:row.sourceUrl,status:row.status,accessMode:row.accessMode,
   agentScope:row.agentScope,contentDigest:row.contentDigest,
   createdBy:row.createdBy,reviewedBy:row.reviewedBy,
   expiresAt:row.expiresAt,publishedAt:row.publishedAt,
   createdAt:row.createdAt,revokedAt:row.revokedAt,
   independentlyVerified:false,externalEffectsAuthorized:false};
 }
 async ingestKnowledge(org:string,identity:VerifiedIdentity,raw:{
   sourceKey?:unknown;title?:unknown;text?:unknown;sourceUrl?:unknown;
   publishedAt?:unknown;expiresAt?:unknown;accessMode?:unknown;
   agentScope?:unknown
 }){
  const sourceKey=this.knowledgeId(raw?.sourceKey,'source key');
  if(sourceKey.length<12)throw new BadRequestException('Source key must have at least 12 characters');
  const title=required(raw?.title,'knowledge title',300);
  const sourceUrl=this.knowledgeUrl(raw?.sourceUrl);
  const publishedAt=this.knowledgeDate(raw?.publishedAt,'publishedAt');
  const expiresAt=this.knowledgeDate(raw?.expiresAt,'expiresAt');
  if(expiresAt&&expiresAt<=new Date())
   throw new BadRequestException('Knowledge source already expired');
  const accessMode=raw?.accessMode??'REVIEWERS_ONLY';
  if(!['REVIEWERS_ONLY','AGENT_SCOPED'].includes(accessMode as string))
   throw new BadRequestException('Unknown knowledge access scope');
  const agents=raw?.agentScope??[];
  if(!Array.isArray(agents)||agents.length>13||
   agents.some(x=>typeof x!=='string'||!AGENT_ROSTER.some(a=>a.id===x))||
   new Set(agents).size!==agents.length||
   (accessMode==='AGENT_SCOPED'&&agents.length===0)||
   (accessMode==='REVIEWERS_ONLY'&&agents.length!==0))
   throw new ForbiddenException('Knowledge scope must use explicit canonical agent IDs');
  const chunks=chunkKnowledge(raw?.text);
  const contentDigest=knowledgeSourceDigest(
   chunks.map(c=>c.content).join('\n[chunk-boundary]\n'));
  return this.knowledgeTx(org,async tx=>{
   await this.knowledgeActor(tx,org,identity,'MANAGE_TENANT');
   const previous=await tx.knowledgeDocument.findFirst({where:{
    organizationId:org,sourceKey}});
   if(previous){
    if(previous.contentDigest!==contentDigest||
     previous.title!==title||previous.sourceUrl!==sourceUrl||
     previous.accessMode!==accessMode||
     JSON.stringify(previous.agentScope)!==JSON.stringify(agents)||
     previous.publishedAt?.toISOString()!==publishedAt?.toISOString()||
     previous.expiresAt?.toISOString()!==expiresAt?.toISOString())
     throw new ConflictException('Immutable source key already bound to different knowledge');
    return{...this.knowledgeMeta(previous),replayed:true};
   }
   const documentId=randomUUID();
   const doc=await tx.knowledgeDocument.create({data:{
    id:documentId,organizationId:org,sourceKey,title,sourceUrl,
    sourceType:'MANUAL',publishedAt,expiresAt,contentDigest,status:'QUARANTINED',
    accessMode:accessMode as string,agentScope:agents as string[],
    createdBy:identity.userId
   }});
   await tx.knowledgeChunk.createMany({data:chunks.map(c=>({
    id:randomUUID(),organizationId:org,documentId,ordinal:c.ordinal,
    content:c.content,digest:c.digest,terms:c.terms,vector:c.vector
   }))});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',
    actorId:identity.userId,action:'KNOWLEDGE_QUARANTINED',
    objectType:'KnowledgeDocument',objectId:doc.id,correlationId:doc.id,
    after:{contentDigest,chunkCount:chunks.length,
     accessMode,sourceKey,externalEffectsAuthorized:false}}});
   return{...this.knowledgeMeta(doc),chunkCount:chunks.length,replayed:false};
  });
 }
 async knowledgeDocuments(org:string,identity:VerifiedIdentity){
  return this.knowledgeTx(org,async tx=>{
   await this.knowledgeActor(tx,org,identity,'READ_AUDIT');
   const rows=await tx.knowledgeDocument.findMany({
    where:{organizationId:org},orderBy:{createdAt:'desc'},take:100});
   return rows.map(x=>this.knowledgeMeta(x));
  });
 }
 async reviewKnowledge(org:string,identity:VerifiedIdentity,
  idInput:unknown,decisionInput:unknown,reasonInput:unknown){
  const id=this.knowledgeId(idInput,'document ID');
  if(!['REVIEW','REJECT'].includes(decisionInput as string))
   throw new BadRequestException('Explicit REVIEW or REJECT required');
  const reason=required(reasonInput,'review rationale',1600);
  if(reason.length<12)throw new BadRequestException('Detailed reviewer rationale required');
  return this.knowledgeTx(org,async tx=>{
   await this.knowledgeActor(tx,org,identity,'MANAGE_TENANT');
   const doc=await tx.knowledgeDocument.findFirst({where:{
    id,organizationId:org}});
   if(!doc)throw new NotFoundException('Knowledge document not found in tenant');
   if(doc.status!=='QUARANTINED')
    throw new ConflictException('Only quarantined knowledge can enter review');
   if(doc.createdBy===identity.userId)
    throw new ForbiddenException('Independent evidence reviewer required');
   if(decisionInput==='REVIEW'&&doc.expiresAt&&doc.expiresAt<=new Date())
    throw new ConflictException('Expired source cannot enter retrieval');
   const status=decisionInput==='REVIEW'?'REVIEWED':'REJECTED';
   const changed=await tx.knowledgeDocument.updateMany({where:{
    id,organizationId:org,status:'QUARANTINED'
   },data:{status,reviewedBy:identity.userId,
    reviewedAt:new Date(),reviewReason:reason}});
   if(changed.count!==1)throw new ConflictException('Concurrent knowledge review');
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',
    actorId:identity.userId,action:'KNOWLEDGE_'+status,
    objectType:'KnowledgeDocument',objectId:id,correlationId:id,
    after:{status,reason,contentDigest:doc.contentDigest,
     independentlyVerified:false,externalEffectsAuthorized:false}}});
   return{documentId:id,status,independentlyVerified:false};
  });
 }
 async revokeKnowledge(org:string,identity:VerifiedIdentity,
  idInput:unknown,reasonInput:unknown){
  const id=this.knowledgeId(idInput,'document ID');
  const reason=required(reasonInput,'revocation rationale',1600);
  if(reason.length<12)throw new BadRequestException('Detailed revocation rationale required');
  return this.knowledgeTx(org,async tx=>{
   await this.knowledgeActor(tx,org,identity,'MANAGE_TENANT');
   const doc=await tx.knowledgeDocument.findFirst({where:{organizationId:org,id}});
   if(!doc)throw new NotFoundException('Knowledge document not found in tenant');
   if(doc.status==='REVOKED')return{documentId:id,status:'REVOKED',replayed:true};
   const changed=await tx.knowledgeDocument.updateMany({where:{
    id,organizationId:org,status:doc.status},data:{
    status:'REVOKED',title:'[REVOKED]',sourceUrl:null,
    revokedBy:identity.userId,revokedAt:new Date()
   }});
   if(changed.count!==1)throw new ConflictException('Concurrent knowledge revocation');
   const scrub=await tx.knowledgeChunk.updateMany({where:{
    organizationId:org,documentId:id},data:{content:'',terms:[],vector:[]}});
   const signals=await tx.learningSignal.findMany({where:{
    organizationId:org,knowledgeDocumentId:id},select:{id:true}});
   await tx.learningSignal.updateMany({where:{
    organizationId:org,knowledgeDocumentId:id},data:{
    status:'REVOKED',sourceUrl:'https://revoked.invalid/',sourceTitle:'[REVOKED]',
    topic:'[REVOKED]',sector:'[REVOKED]',evidence:{revoked:true}
   }});
   if(signals.length){
    await tx.agentSkillProposal.updateMany({where:{
     organizationId:org,evidenceSignalId:{in:signals.map(x=>x.id)}},
     data:{status:'WITHDRAWN_SOURCE_REVOKED',
      evaluation:{evaluationStatus:'SOURCE_REVOKED',requiresNewCodeReview:true}}});
   }
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',
    actorId:identity.userId,action:'KNOWLEDGE_SOURCE_REVOKED_AND_SCRUBBED',
    objectType:'KnowledgeDocument',objectId:id,correlationId:id,
    after:{reason,contentDigest:doc.contentDigest,
     scrubbedChunks:scrub.count,linkedSignals:signals.length,
     requiresHistoricalRetentionReview:true,externalEffectsAuthorized:false}}});
   await tx.outboxEvent.create({data:{organizationId:org,eventId:randomUUID(),
    eventType:'KnowledgeSourceRevokedInternal',aggregateType:'KnowledgeDocument',
    aggregateId:id,correlationId:id,
    payload:{documentId:id,sourceRevoked:true,externalEffectsAuthorized:false}}});
   return{documentId:id,status:'REVOKED',scrubbedChunks:scrub.count,
    withdrawnSignals:signals.length,replayed:false};
  });
 }
 /**
  * Gate 1: live, human-reviewed source; Gate 2: permitted agent scope;
  * Gate 3: indexed lexical candidate shortlist + LOCAL sparse cosine scoring.
  * This is evidence retrieval, NOT fact validation or provider semantic RAG.
  */
 private async knowledgeRetrieve(org:string,queryRaw:unknown,
  agentId?:string,limitRaw?:unknown){
  const query=required(queryRaw,'knowledge query',400);
  if(query.length<3)throw new BadRequestException('Knowledge query too short');
  const limit=limitRaw===undefined?5:limitRaw;
  if(!Number.isSafeInteger(limit)||(limit as number)<1||(limit as number)>10)
   throw new BadRequestException('Knowledge result limit must be 1-10');
  const terms=knowledgeTerms(query);
  if(!terms.length)return{results:[],query,reviewedOnly:true,
   independentlyVerified:false,externalEffectsAuthorized:false};
  const queryVector=sparseKnowledgeVector(query);
  return this.knowledgeTx(org,async tx=>{
   // Strictly intersect tenant, review state, source freshness, agent ACL,
   // indexed terms and FTS before any content crosses the service boundary.
   const rows=await tx.$queryRaw<Array<{
    id:string;ordinal:number;content:string;digest:string;
    vector:number[];textRank:number;documentId:string;
    title:string;sourceUrl:string|null;sourceKey:string;contentDigest:string;
    publishedAt:Date|null;expiresAt:Date|null
   }>>`
    SELECT c."id",c."ordinal",c."content",c."digest",c."vector",
     ts_rank_cd(to_tsvector('english',c."content"),
      plainto_tsquery('english',${query}))::float8 AS "textRank",
     d."id" AS "documentId",d."title",d."sourceUrl",d."sourceKey",
     d."contentDigest",d."publishedAt",d."expiresAt"
    FROM "KnowledgeChunk" c
    JOIN "KnowledgeDocument" d ON d."id"=c."documentId"
     AND d."organizationId"=c."organizationId"
    WHERE c."organizationId"=${org} AND d."organizationId"=${org}
     AND d."status"='REVIEWED'
     AND (d."expiresAt" IS NULL OR d."expiresAt">CURRENT_TIMESTAMP)
     AND (${agentId??null}::text IS NULL OR
      (d."accessMode"='AGENT_SCOPED' AND ${agentId??null}::text=ANY(d."agentScope")))
     AND (c."terms" && ${terms}::text[] OR
      to_tsvector('english',c."content") @@ plainto_tsquery('english',${query}))
    ORDER BY "textRank" DESC,c."createdAt" DESC LIMIT 250`;
   const scored=rows.map(row=>{
    const cosine=knowledgeCosine(row.vector,queryVector);
    const score=evidenceScore({textRank:row.textRank,cosine,
     publishedAt:row.publishedAt});
    return{documentId:row.documentId,chunkId:row.id,ordinal:row.ordinal,
     citationRef:'kb:'+row.documentId+':'+row.ordinal+':'+row.digest.slice(7,19),
     snippet:row.content.slice(0,480),chunkDigest:row.digest,
     sourceDigest:row.contentDigest,sourceKey:row.sourceKey,
     sourceTitle:row.title,sourceUrl:row.sourceUrl,
     publishedAt:row.publishedAt,expiresAt:row.expiresAt,score,
     independentlyVerified:false,untrustedSourceText:true,
     externalEffectsAuthorized:false};
   }).sort((a,b)=>b.score-a.score||
    a.documentId.localeCompare(b.documentId)||a.ordinal-b.ordinal);
   // Avoid citation flooding: take at most two excerpts per source.
   const perSource=new Map<string,number>();
   const results= scored.filter(x=>{
    const n=perSource.get(x.documentId)??0;
    if(n>=2)return false;
    perSource.set(x.documentId,n+1);return true;
   }).slice(0,limit as number);
   return{query,results,reviewedOnly:true,
    retrievalMethod:'POSTGRES_FULL_TEXT_PLUS_LOCAL_SPARSE_VECTOR' as const,
    semanticModelEmbeddings:false,independentlyVerified:false,
    externalEffectsAuthorized:false};
  });
 }
 async searchKnowledge(org:string,identity:VerifiedIdentity,
  query:unknown,limit?:unknown){
  await this.knowledgeTx(org,tx=>this.knowledgeActor(tx,org,identity,'READ_AUDIT'));
  return this.knowledgeRetrieve(org,query,undefined,limit);
 }
 async contextForAgent(org:string,agentId:string,query:unknown){
  if(!AGENT_ROSTER.some(a=>a.id===agentId))
   throw new ForbiddenException('Unknown canonical agent cannot retrieve knowledge');
  return this.knowledgeRetrieve(org,query,agentId,3);
 }
 /**
  * Source-approved learning can only create a QUARANTINED LearningSignal.
  * The pre-existing verify -> propose -> evaluate -> code-review pipeline
  * remains the only path for acquiring a skill; auto-learning is prohibited.
  */
 async promoteKnowledgeSignal(org:string,identity:VerifiedIdentity,
  documentIdInput:unknown,raw:{topic?:unknown;sector?:unknown}){
  const documentId=this.knowledgeId(documentIdInput,'document ID');
  const topic=required(raw?.topic,'learning topic',180);
  const sector=required(raw?.sector,'learning sector',120);
  return this.knowledgeTx(org,async tx=>{
   await this.knowledgeActor(tx,org,identity,'MANAGE_TENANT');
   const doc=await tx.knowledgeDocument.findFirst({where:{organizationId:org,
    id:documentId,status:'REVIEWED'}});
   if(!doc||!doc.sourceUrl||doc.expiresAt&&doc.expiresAt<=new Date())
    throw new ConflictException('Only active reviewed HTTPS evidence may enter learning');
   const prior=await tx.learningSignal.findFirst({where:{
    organizationId:org,knowledgeDocumentId:documentId}});
   if(prior)return{signalId:prior.id,status:prior.status,replayed:true,
    skillReleased:false};
   const chunk=await tx.knowledgeChunk.findFirst({where:{
    organizationId:org,documentId},orderBy:{ordinal:'asc'}});
   if(!chunk||!chunk.content)throw new ConflictException('Source evidence unavailable');
   const fingerprint=knowledgeSourceDigest(JSON.stringify([
    'knowledge-document-v1',org,documentId,doc.contentDigest])).slice(7);
   const signal=await tx.learningSignal.create({data:{
    id:randomUUID(),organizationId:org,fingerprint,
    topic,sector,sourceUrl:doc.sourceUrl,sourceTitle:doc.title,
    observedAt:new Date(),sourcePublishedAt:doc.publishedAt,
    evidence:{summary:chunk.content.slice(0,700),
     excerpt:chunk.content.slice(0,400),
     knowledgeDocumentId:documentId,sourceDigest:doc.contentDigest,
     independentlyVerified:false},
    knowledgeDocumentId:documentId,status:'QUARANTINED'
   }});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',
    actorId:identity.userId,action:'KNOWLEDGE_LINKED_LEARNING_SIGNAL_QUARANTINED',
    objectType:'LearningSignal',objectId:signal.id,correlationId:signal.id,
    after:{knowledgeDocumentId:documentId,sourceDigest:doc.contentDigest,
     skillReleased:false,independentlyVerified:false}}});
   return{signalId:signal.id,status:'QUARANTINED',replayed:false,
    skillReleased:false};
  });
 }
 async trendBrief(organizationId:string,sector?:string){
  const normalized=typeof sector==='string'&&sector.trim()?sector.trim().slice(0,120):undefined;
  const signals=await this.db.learningSignal.findMany({
   where:{organizationId,status:'REVIEWED',...(normalized?{sector:normalized}:{}),
    OR:[{knowledgeDocumentId:null},{knowledgeDocument:{status:'REVIEWED',
      expiresAt:null}},{knowledgeDocument:{status:'REVIEWED',
      expiresAt:{gt:new Date()}}}]},
   orderBy:{observedAt:'desc'},take:200,
   select:{id:true,topic:true,sector:true,sourceUrl:true,sourceTitle:true,sourcePublishedAt:true,observedAt:true}
  });
  const groups=new Map<string,{topic:string;sector:string;signals:typeof signals}>();
  for(const item of signals){
   const key=item.sector.toLowerCase()+'::'+item.topic.toLowerCase();
   const group=groups.get(key)??{topic:item.topic,sector:item.sector,signals:[]};
   group.signals.push(item);groups.set(key,group);
  }
  const now=Date.now();
  const topics=[...groups.values()].map(group=>{
   const recent=group.signals.filter(item=>now-item.observedAt.getTime()<=90*86400000).length;
   const distinctSources=new Set(group.signals.map(item=>{try{return new URL(item.sourceUrl).hostname}catch{return item.sourceUrl}})).size;
   return{topic:group.topic,sector:group.sector,evidenceCount:group.signals.length,recentSignals90Days:recent,distinctSourceHosts:distinctSources,
    evidence:group.signals.slice(0,10).map(item=>({signalId:item.id,title:item.sourceTitle,url:item.sourceUrl,publishedAt:item.sourcePublishedAt})),
    priority:recent>=3&&distinctSources>=2?'RESEARCH_PRIORITY':'MONITOR',
    status:'HUMAN_REVIEWED_NOT_INDEPENDENTLY_VERIFIED',inferenceAuthorized:false};
  }).sort((a,b)=>b.recentSignals90Days-a.recentSignals90Days||b.distinctSourceHosts-a.distinctSourceHosts);
  return{organizationId,sector:normalized??null,topics,processed:signals.length,sourceType:'LEARNING_SIGNAL_REGISTRY',
   independentVerification:false,externalPublishingEnabled:false};
 }
 async signals(organizationId:string){return this.db.learningSignal.findMany({where:{organizationId},orderBy:{createdAt:'desc'},take:100});}
 async proposals(organizationId:string){return this.db.agentSkillProposal.findMany({where:{organizationId},orderBy:{createdAt:'desc'},take:100});}
 async propose(organizationId:string,actorId:string,raw:{signalId:string;agentId:string;skillKey:string;rationale:string}){
  const signalId=required(raw?.signalId,'signalId',200),agentId=required(raw?.agentId,'agentId',100);
  const skillKey=required(raw?.skillKey,'skillKey',120),rationale=required(raw?.rationale,'rationale',3000);
  const manifest=AGENT_ROSTER.find(a=>a.id===agentId);
  if(!manifest)throw new BadRequestException('Unknown agent');
  // Learning may propose only existing declared capabilities; new executable capabilities require a code-reviewed manifest release.
  if(!manifest.capabilities.includes(skillKey))throw new ForbiddenException('Skill outside signed agent manifest');
  const signal=await this.db.learningSignal.findFirst({where:{id:signalId,organizationId}});
  if(!signal)throw new NotFoundException('Evidence signal not found in tenant');
  if(signal.status!=='REVIEWED')throw new ConflictException('Evidence must be reviewed before skill proposal');
  if(signal.knowledgeDocumentId){
   const parent=await this.db.knowledgeDocument.findFirst({where:{
    organizationId,id:signal.knowledgeDocumentId,status:'REVIEWED',
    OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]
   }});
   if(!parent)throw new ConflictException('Learning source has expired or been revoked');
  }
  const existing=await this.db.agentSkillProposal.findUnique({where:{organizationId_agentId_skillKey_version:{organizationId,agentId,skillKey,version:1}}});
  if(existing)return existing;
  return this.db.agentSkillProposal.create({data:{id:randomUUID(),organizationId,agentId,skillKey,rationale,evidenceSignalId:signal.id,version:1,status:'PROPOSED',evaluation:{evaluationStatus:'NOT_RUN',proposedBy:actorId}}});
 }
 async verify(organizationId:string,actorId:string,signalId:string){
  return this.db.$transaction(async tx=>{
   const signal=await tx.learningSignal.findFirst({where:{
    id:signalId,organizationId,status:'QUARANTINED'
   }});
   if(!signal)throw new ConflictException('Evidence not found or already reviewed');
   if(signal.knowledgeDocumentId){
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
    const document=await tx.knowledgeDocument.findFirst({where:{
     id:signal.knowledgeDocumentId,organizationId,status:'REVIEWED',
     OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]
    }});
    if(!document)throw new ConflictException('Knowledge source no longer reviewable');
    if(actorId===document.createdBy)
     throw new ForbiddenException('Source creator cannot independently attest a linked signal');
   }
   const changed=await tx.learningSignal.updateMany({where:{id:signalId,organizationId,status:'QUARANTINED'},data:{status:'REVIEWED'}});
   if(changed.count!==1)throw new ConflictException('Evidence not found or already reviewed');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,action:'LEARNING_SIGNAL_REVIEWED',objectType:'LearningSignal',objectId:signalId,correlationId:randomUUID(),after:{status:'REVIEWED',verification:'NOT_INDEPENDENTLY_VERIFIED'}}});
   return{signalId,status:'REVIEWED'};
  });
 }
}
