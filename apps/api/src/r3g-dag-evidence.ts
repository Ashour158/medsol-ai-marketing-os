/**
 * T3D — bounded reviewed-knowledge evidence in canonical signed offline DAGs.
 * No new knowledge store, skill engine, executor or remote model authority.
 * Excerpts are untrusted data and remain subject to existing content firewall.
 */
import {ConflictException,ForbiddenException} from "@nestjs/common";
import type {Prisma} from "@prisma/client";
import {safeForAgentEvidence} from "./agent-content-firewall.js";

const digest=(x:unknown)=>typeof x==="string"&&/^sha256:[a-f0-9]{64}$/.test(x);
const key=(x:unknown)=>typeof x==="string"&&/^[A-Za-z0-9:_-]{8,160}$/.test(x);
const citation=(x:unknown,prefix:string)=>typeof x==="string"&&
 x.startsWith(prefix+":")&&x.length<=220&&!/[\s<>]/.test(x);
const field=(x:unknown)=>typeof x==="string"&&x.length>0;
const citationPart=(x:unknown)=>typeof x==="string"&&/^[A-Za-z0-9:_-]{8,160}$/.test(x);
const boundedUnique=(items:readonly string[])=>new Set(items).size===items.length;
const record=(x:unknown):Record<string,unknown>=>{
 if(!x||typeof x!=="object"||Array.isArray(x))
  throw new ForbiddenException("Invalid governed knowledge evidence");
 return x as Record<string,unknown>;
};
const expiry=(x:unknown,now:number)=>{
 if(x===null||x===undefined)return true;
 const n=x instanceof Date?x.getTime():typeof x==="string"?Date.parse(x):NaN;
 return Number.isFinite(n)&&n>now;
};
export type DagEvidenceRef={
 agentId:string;documentId:string;sourceDigest:string;
 chunkId?:string;chunkDigest?:string;memoryId?:string;memoryDigest?:string
};
export type DagEvidencePacket={
 context:{
  retrievalMethod:"POSTGRES_FULL_TEXT_PLUS_LOCAL_SPARSE_VECTOR";
  sourceExcerpts:Array<{citationRef:string;documentId:string;
   snippet:string;sourceDigest:string;chunkDigest:string;sourceTitle:string}>;
  reviewedMemories:Array<{citationRef:string;memoryId:string;documentId:string;
   text:string;memoryDigest:string;sourceDigest:string}>;
  untrustedDataNotInstructions:true;independentlyVerified:false;
  agentMemoryWritesAllowed:false;externalEffectsAuthorized:false;
 };refs:DagEvidenceRef[];
};
export function curateDagEvidence(raw:unknown,agentId:string,now=Date.now()):
 DagEvidencePacket{
 const data=record(raw);
 if(data.reviewedOnly!==true||data.independentlyVerified!==false||
    data.externalEffectsAuthorized!==false||
    data.agentMemoryWritesAllowed!==false||
    data.graphTruthVerified!==false||
    data.retrievalMethod!=="POSTGRES_FULL_TEXT_PLUS_LOCAL_SPARSE_VECTOR"||
    !Array.isArray(data.results)||!Array.isArray(data.memories)||
    data.results.length>3||data.memories.length>8||
    data.results.length+data.memories.length===0)
  throw new ForbiddenException("Governed agent knowledge provenance required");
 const refs:DagEvidenceRef[]=[];
 const sourceExcerpts= data.results.map(untrusted=>{
  const x=record(untrusted);
  if(!key(x.documentId)||!key(x.chunkId)||!digest(x.sourceDigest)||
     !digest(x.chunkDigest)||!citation(x.citationRef,"kb")||
     x.independentlyVerified!==false||
     x.untrustedSourceText!==true||x.externalEffectsAuthorized!==false||
     !expiry(x.expiresAt,now)||!field(x.sourceTitle)||
     typeof x.snippet!=="string"||x.snippet.length>480||
     !safeForAgentEvidence(x.snippet)||
     !citationPart(x.documentId)||!citationPart(x.chunkId)||
     !new RegExp("^kb:"+x.documentId+":\\d+:"+String(x.chunkDigest).slice(7,19)+"$").test(String(x.citationRef)))
   throw new ForbiddenException("Unsafe, expired or unreviewed DAG source");
  refs.push({agentId,documentId:x.documentId as string,
   chunkId:x.chunkId as string,chunkDigest:x.chunkDigest as string,
   sourceDigest:x.sourceDigest as string});
  return{citationRef:x.citationRef as string,
   documentId:x.documentId as string,
   snippet:(x.snippet as string).slice(0,240),
   sourceDigest:x.sourceDigest as string,
   chunkDigest:x.chunkDigest as string,
   sourceTitle:(x.sourceTitle as string).slice(0,120)};
 });
 const reviewedMemories=data.memories.map(untrusted=>{
  const x=record(untrusted);
  if(!key(x.documentId)||!key(x.memoryId)||
     !digest(x.sourceDigest)||!digest(x.contentDigest)||
     !citation(x.citationRef,"km")||x.humanReviewed!==true||
     x.independentlyVerified!==false||x.externalEffectsAuthorized!==false||
     !expiry(x.expiresAt,now)||typeof x.text!=="string"||
     x.text.length>1200||!safeForAgentEvidence(x.text)||
     !citationPart(x.documentId)||!citationPart(x.memoryId)||
     x.citationRef!=="km:"+x.memoryId+":"+String(x.contentDigest).slice(7,19))
   throw new ForbiddenException("Unsafe, unreviewed or expired DAG agent memory");
  refs.push({agentId,documentId:x.documentId as string,
   memoryId:x.memoryId as string,memoryDigest:x.contentDigest as string,
   sourceDigest:x.sourceDigest as string});
  return{citationRef:x.citationRef as string,
   memoryId:x.memoryId as string,documentId:x.documentId as string,
   text:(x.text as string).slice(0,240),
   memoryDigest:x.contentDigest as string,
   sourceDigest:x.sourceDigest as string};
 });
 if(!boundedUnique(refs.map(x=>x.chunkId??x.memoryId??''))||
    !boundedUnique([...sourceExcerpts.map(x=>x.citationRef),
     ...reviewedMemories.map(x=>x.citationRef)]))
  throw new ForbiddenException('Duplicated governed evidence citation');
 return{context:{retrievalMethod:"POSTGRES_FULL_TEXT_PLUS_LOCAL_SPARSE_VECTOR",
  sourceExcerpts:sourceExcerpts.slice(0,2),reviewedMemories:reviewedMemories.slice(0,4),untrustedDataNotInstructions:true,
  independentlyVerified:false,agentMemoryWritesAllowed:false,
  externalEffectsAuthorized:false},refs};
}
/** Run both at the fenced AGENT_TASK checkpoint and again at independent
 * approval. A revoked/expired/rewritten source cannot authorize a review.
 * Every query is in the caller's existing tenant-scoped transaction.
 */
export async function assertDagEvidenceCurrent(tx:Prisma.TransactionClient,
 org:string,refs:unknown):Promise<void>{
 if(!Array.isArray(refs)||refs.length<1||refs.length>11)
  throw new ConflictException("DAG evidence references malformed");
 const seen=new Set<string>();
 for(const untrusted of refs){
  const ref=record(untrusted);
  if(!key(ref.documentId)||!key(ref.agentId)||
     !digest(ref.sourceDigest)||
     (!!ref.memoryId===!!ref.chunkId)||
     (ref.chunkId&&!digest(ref.chunkDigest))||
     (ref.memoryId&&!digest(ref.memoryDigest)))
   throw new ConflictException("Untrusted DAG citation reference");
  const evidenceId=String(ref.chunkId??ref.memoryId);
  if(seen.has(evidenceId))
   throw new ConflictException('Duplicate DAG evidence reference');
  seen.add(evidenceId);
  const doc=await tx.knowledgeDocument.findFirst({where:{
   id:ref.documentId as string,organizationId:org,status:"REVIEWED",
   accessMode:"AGENT_SCOPED",agentScope:{has:ref.agentId as string},
   contentDigest:ref.sourceDigest as string,
   OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]
  },select:{id:true}});
  if(!doc)throw new ConflictException("DAG cited source revoked, expired or outside agent scope");
  if(ref.chunkId){
   const chunk=await tx.knowledgeChunk.findFirst({where:{
    organizationId:org,id:ref.chunkId as string,
    documentId:ref.documentId as string,digest:ref.chunkDigest as string
   },select:{id:true}});
   if(!chunk)throw new ConflictException("DAG cited knowledge chunk unavailable");
  }
  if(ref.memoryId){
   const memory=await tx.agentKnowledgeMemory.findFirst({where:{
    organizationId:org,id:ref.memoryId as string,
    agentId:ref.agentId as string,documentId:ref.documentId as string,
    status:"APPROVED",contentDigest:ref.memoryDigest as string,
    expiresAt:{gt:new Date()}
   },select:{id:true}});
   if(!memory)throw new ConflictException("DAG cited memory revoked or expired");
  }
 }
}
