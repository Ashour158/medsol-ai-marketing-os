import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService,withMarketingTenant} from './prisma.service.js';

export type BrandRules={
 voice:string;
 primaryColor:string;
 prohibitedClaims:string[];
 requiredDisclaimers:string[];
};
function textValue(value:unknown,name:string,max:number):string{
 if(typeof value!=='string'||!value.trim()||value.length>max)throw new BadRequestException('Invalid '+name);
 return value.trim();
}
function listValue(value:unknown,name:string):string[]{
 if(!Array.isArray(value)||value.length>30)throw new BadRequestException('Invalid '+name);
 const out=value.map(x=>textValue(x,name,200));
 if(new Set(out.map(x=>x.toLowerCase())).size!==out.length)throw new BadRequestException('Duplicate '+name);
 return out;
}
function parseRules(raw:unknown):BrandRules{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Structured brand rules required');
 const x=raw as Record<string,unknown>;
 if(Object.keys(x).some(k=>!['voice','primaryColor','prohibitedClaims','requiredDisclaimers'].includes(k)))
   throw new BadRequestException('Unsupported brand rule');
 const primaryColor=textValue(x.primaryColor,'brand color',7);
 if(!/^#[0-9A-Fa-f]{6}$/.test(primaryColor))throw new BadRequestException('Brand color must be a hex token');
 return{voice:textValue(x.voice,'brand voice',400),primaryColor,
   prohibitedClaims:listValue(x.prohibitedClaims,'prohibited claims'),
   requiredDisclaimers:listValue(x.requiredDisclaimers,'required disclaimers')};
}
@Injectable()
export class BrandMasterService{
 constructor(private readonly db:PrismaService){}
 active(organizationId:string){
  return withMarketingTenant(this.db,organizationId,tx=>tx.brandMasterRevision.findFirst({
    where:{organizationId,status:'APPROVED'},orderBy:{version:'desc'},
    select:{id:true,version:true,status:true,sourceReference:true,rules:true,approvedBy:true,approvedAt:true}
  }));
 }
 revisions(organizationId:string){
  return withMarketingTenant(this.db,organizationId,tx=>tx.brandMasterRevision.findMany({where:{organizationId},orderBy:{version:'desc'},take:25,
    select:{id:true,version:true,status:true,sourceReference:true,proposedBy:true,approvedBy:true,approvedAt:true,createdAt:true}}));
 }
 async propose(organizationId:string,actorId:string,raw:{sourceReference?:unknown;rules?:unknown}){
  const sourceReference=textValue(raw?.sourceReference,'source reference',1000);
  // No arbitrary retrieval takes place; provenance is subject to separate human inspection.
  if(!sourceReference.startsWith('https://')&&!sourceReference.startsWith('internal:'))
    throw new BadRequestException('Provide an HTTPS reference or an internal approved document reference');
  const rules=parseRules(raw?.rules);
  // The transaction contains DB writes + an audit event only. A PostgreSQL
  // P2034 abort rolls ALL of them back; bounded retry is therefore safe here,
  // unlike broad retries around commands with external side effects.
  for(let attempt=0;attempt<3;attempt++){
   try{return await withMarketingTenant(this.db,organizationId,async tx=>{
    const latest=await tx.brandMasterRevision.findFirst({where:{organizationId},orderBy:{version:'desc'},select:{version:true}});
    const created=await tx.brandMasterRevision.create({data:{
      id:randomUUID(),organizationId,version:(latest?.version??0)+1,status:'DRAFT',
      sourceReference,rules,proposedBy:actorId
    }});
    await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
      action:'BRAND_MASTER_REVISION_PROPOSED',objectType:'BrandMasterRevision',objectId:created.id,
      correlationId:created.id,after:{version:created.version,status:'DRAFT',sourceReference}}});
    return{revisionId:created.id,version:created.version,status:'DRAFT',releaseAuthorized:false};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
   catch(error){
    const code=(error as {code?:string})?.code;
    if(code==='P2034'&&attempt<2){
     await new Promise<void>(resolve=>setTimeout(resolve,12*(attempt+1)));
     continue;
    }
    if(code==='P2002'||code==='P2034')
     throw new ConflictException('Concurrent brand revision; refresh and retry');
    throw error;
   }
  }
  throw new ConflictException('Concurrent brand revision; refresh and retry');
 }
 async decide(organizationId:string,actorId:string,revisionId:string,decision:'APPROVE'|'REJECT',reason:string){
  if(!['APPROVE','REJECT'].includes(decision))throw new BadRequestException('Invalid brand decision');
  const rationale=textValue(reason,'decision rationale',2000);
  if(rationale.length<12)throw new BadRequestException('Decision rationale must contain at least 12 characters');
  return withMarketingTenant(this.db,organizationId,async tx=>{
    const row=await tx.brandMasterRevision.findFirst({where:{id:revisionId,organizationId}});
    if(!row)throw new NotFoundException('Brand revision not found in tenant');
    if(row.status!=='DRAFT')throw new ConflictException('Brand revision already decided');
    if(row.proposedBy===actorId)throw new ForbiddenException('Independent brand reviewer required');
    const latest=await tx.brandMasterRevision.findFirst({
      where:{organizationId,status:'APPROVED'},orderBy:{version:'desc'},select:{version:true}
    });
    if(decision==='APPROVE'&&latest&&latest.version>row.version)
      throw new ConflictException('Cannot approve a version older than the active Brand Master');
    const status=decision==='APPROVE'?'APPROVED':'REJECTED';
    const changed=await tx.brandMasterRevision.updateMany({
      where:{id:revisionId,organizationId,status:'DRAFT'},data:{status,approvedBy:actorId,approvedAt:new Date()}
    });
    if(changed.count!==1)throw new ConflictException('Brand revision was decided concurrently');
    await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
      action:'BRAND_MASTER_REVISION_DECIDED',objectType:'BrandMasterRevision',objectId:revisionId,
      correlationId:revisionId,after:{status,version:row.version,reason:rationale}}});
    return{revisionId,version:row.version,status,approvedBy:actorId,externalPublishingAuthorized:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
}
