import {ConflictException} from '@nestjs/common';
import type {Prisma} from '@prisma/client';
import type {MarketingLearningService} from './marketing-learning.service.js';
import {knowledgeSourceDigest} from './knowledge-retrieval.js';
export type ContextReference={kind:'SOURCE'|'MEMORY';documentId:string;recordId:string;citationRef:string;digest:string;sourceDigest:string};
export type SpecialistContextPin={query:string;references:ContextReference[]};
export function contextPinTuple(pin:SpecialistContextPin){
 return [pin.query,pin.references.map(r=>[r.kind,r.documentId,r.recordId,r.citationRef,r.digest,r.sourceDigest])];
}
export function parseContextPin(raw:unknown,query:string):SpecialistContextPin{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ConflictException('Exact specialist context required');
 const p=raw as SpecialistContextPin;
 const digest=(v:unknown)=>typeof v==='string'&&/^sha256:[0-9a-f]{64}$/.test(v);
 const id=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{8,160}$/.test(v);
 if(p.query!==query||!Array.isArray(p.references)||p.references.length<1||p.references.length>11||
 p.references.some(r=>!r||!['SOURCE','MEMORY'].includes(r.kind)||!id(r.documentId)||!id(r.recordId)||!digest(r.digest)||!digest(r.sourceDigest)||typeof r.citationRef!=='string'||r.citationRef.length>240||
 !(r.kind==='SOURCE'?r.citationRef.startsWith('kb:'+r.documentId+':'):r.citationRef==='km:'+r.recordId+':'+r.digest.slice(7,19)))||
 new Set(p.references.map(r=>r.kind+':'+r.recordId)).size!==p.references.length)
 throw new ConflictException('Invalid bounded specialist context pin');
 return{query,references:p.references.map(r=>({kind:r.kind,documentId:r.documentId,recordId:r.recordId,citationRef:r.citationRef,digest:r.digest,sourceDigest:r.sourceDigest}))};
}
export async function loadSpecialistContextPin(learning:MarketingLearningService|undefined,tx:Prisma.TransactionClient,org:string,agentId:string,query:string){
 if(!learning)throw new ConflictException('Canonical knowledge fabric unavailable');
 const project=async()=>{
  const context=await learning.contextForAgent(org,agentId,query,tx);
  const references:ContextReference[]=[
   ...context.results.map(x=>({kind:'SOURCE' as const,documentId:x.documentId,recordId:x.chunkId,citationRef:x.citationRef,digest:x.chunkDigest,sourceDigest:x.sourceDigest})),
   ...context.memories.map(x=>({kind:'MEMORY' as const,documentId:x.documentId,recordId:x.memoryId,citationRef:x.citationRef,digest:x.contentDigest,sourceDigest:x.sourceDigest}))
  ];
  references.sort((a,b)=>(a.kind+':'+a.recordId).localeCompare(b.kind+':'+b.recordId));
  return parseContextPin({query,references},query);
 };
 const before=await project();
 const docs=[...new Set(before.references.map(r=>r.documentId))].sort();
 const chunks=before.references.filter(r=>r.kind==='SOURCE').map(r=>r.recordId).sort();
 const memories=before.references.filter(r=>r.kind==='MEMORY').map(r=>r.recordId).sort();
 // Lock existing sources and dependent rows in the same order as source
 // revocation. Re-read canonical retrieval under those locks, fail on drift.
 await tx.$queryRaw`SELECT "id" FROM "KnowledgeDocument" WHERE "organizationId"=${org} AND "id"=ANY(${docs}::text[]) ORDER BY "id" FOR SHARE`;
 if(chunks.length)await tx.$queryRaw`SELECT "id" FROM "KnowledgeChunk" WHERE "organizationId"=${org} AND "id"=ANY(${chunks}::text[]) ORDER BY "id" FOR SHARE`;
 if(memories.length)await tx.$queryRaw`SELECT "id" FROM "AgentKnowledgeMemory" WHERE "organizationId"=${org} AND "id"=ANY(${memories}::text[]) ORDER BY "id" FOR SHARE`;
 const after=await project();
 if(JSON.stringify(contextPinTuple(before))!==JSON.stringify(contextPinTuple(after)))throw new ConflictException('Specialist context changed during review');
 for(const r of after.references){
  const doc=await tx.knowledgeDocument.findFirst({where:{organizationId:org,id:r.documentId,status:'REVIEWED',accessMode:'AGENT_SCOPED',agentScope:{equals:[agentId]},expiresAt:{gt:new Date()}},select:{contentDigest:true}});
  if(!doc||doc.contentDigest!==r.sourceDigest)throw new ConflictException('Specialist source no longer eligible');
  if(r.kind==='SOURCE'){
   const chunk=await tx.knowledgeChunk.findFirst({where:{organizationId:org,id:r.recordId,documentId:r.documentId},select:{content:true,digest:true}});
   if(!chunk||chunk.digest!==r.digest||knowledgeSourceDigest(chunk.content)!==r.digest)throw new ConflictException('Specialist source digest changed');
  }else{
   const memory=await tx.agentKnowledgeMemory.findFirst({where:{organizationId:org,id:r.recordId,agentId,documentId:r.documentId,status:'APPROVED',expiresAt:{gt:new Date()}},select:{content:true,contentDigest:true}});
   if(!memory||memory.contentDigest!==r.digest||knowledgeSourceDigest(memory.content)!==r.digest)throw new ConflictException('Specialist memory digest changed');
  }
 }
 return after;
}
