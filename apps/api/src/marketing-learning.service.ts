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
 async trendBrief(organizationId:string,sector?:string){
  const normalized=typeof sector==='string'&&sector.trim()?sector.trim().slice(0,120):undefined;
  const signals=await this.db.learningSignal.findMany({
   where:{organizationId,status:'REVIEWED',...(normalized?{sector:normalized}:{})},
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
  const existing=await this.db.agentSkillProposal.findUnique({where:{organizationId_agentId_skillKey_version:{organizationId,agentId,skillKey,version:1}}});
  if(existing)return existing;
  return this.db.agentSkillProposal.create({data:{id:randomUUID(),organizationId,agentId,skillKey,rationale,evidenceSignalId:signal.id,version:1,status:'PROPOSED',evaluation:{evaluationStatus:'NOT_RUN',proposedBy:actorId}}});
 }
 async verify(organizationId:string,actorId:string,signalId:string){
  return this.db.$transaction(async tx=>{
   const changed=await tx.learningSignal.updateMany({where:{id:signalId,organizationId,status:'QUARANTINED'},data:{status:'REVIEWED'}});
   if(changed.count!==1)throw new ConflictException('Evidence not found or already reviewed');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,action:'LEARNING_SIGNAL_REVIEWED',objectType:'LearningSignal',objectId:signalId,correlationId:randomUUID(),after:{status:'REVIEWED',verification:'NOT_INDEPENDENTLY_VERIFIED'}}});
   return{signalId,status:'REVIEWED'};
  });
 }
}
