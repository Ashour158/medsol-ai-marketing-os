import { Injectable, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import {Prisma} from '@prisma/client';
import type {VerifiedIdentity} from './oidc-identity.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import {SYNTHETIC_PRICING,normalizePriceProposal,priceProposalId,readPriceProposal,buildPriceProposal} from './synthetic-price-proposal.js';
import { PrismaService,withMarketingTenant } from './prisma.service.js';

@Injectable()
export class MarketingCatalogService {
  constructor(private readonly db: PrismaService) {}
  async proposeSyntheticPrice(org:string,identity:VerifiedIdentity,raw:unknown){
    if(!identity||identity.organizationId!==org||!identity.subject)throw new ForbiddenException('Verified tenant pricing operator required');
    const input=normalizePriceProposal(raw),approvalId=priceProposalId(org,input.proposalKey);
    for(let attempt=0;attempt<3;attempt++)try{
     return await withMarketingTenant(this.db,org,async tx=>{
      await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_CAMPAIGN');
      const prior=await tx.approval.findFirst({where:{organizationId:org,id:approvalId}});
      if(prior){
       const scope=readPriceProposal(prior);
       if(scope.requestedBy!==identity.userId||JSON.stringify(scope.input)!==JSON.stringify(input))
        throw new ConflictException('Immutable synthetic price proposal key already used');
       return {approvalId,decision:prior.decision,...scope,replayed:true};
      }
      const now=new Date(),{scope,scopeDigest}=await buildPriceProposal(tx,org,identity.userId,input,now);
      await tx.approval.create({data:{id:approvalId,organizationId:org,objectType:SYNTHETIC_PRICING,objectId:input.productId,
       requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R2',requestedBy:identity.userId,scope,scopeDigest,scopeExpiresAt:new Date(input.expiresAt)}});
      await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'SYNTHETIC_PRICING_PROPOSED',
       objectType:SYNTHETIC_PRICING,objectId:input.productId,correlationId:approvalId,after:{scopeDigest,scenarioOnly:true,catalogMutationAuthorized:false,externalEffectsAuthorized:false}}});
      return {approvalId,decision:'PENDING',...scope,replayed:false};
     },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    }catch(e){const code=(e as {code?:string})?.code;if(code==='P2034'&&attempt<2)continue;
     if(code==='P2034'||code==='P2002')throw new ConflictException('Concurrent synthetic price proposal; refresh and retry same key');throw e;}
    throw new ConflictException('Synthetic price proposal retry limit');
  }
  async syntheticPriceProposals(org:string,identity:VerifiedIdentity){
    if(!identity||identity.organizationId!==org||!identity.subject)throw new ForbiddenException('Verified tenant pricing reviewer required');
    return withMarketingTenant(this.db,org,async tx=>{
     await assertActorPermissionInTenantTransaction(tx,identity,'READ_AUDIT');
     const rows=await tx.approval.findMany({where:{organizationId:org,objectType:SYNTHETIC_PRICING},take:101,orderBy:[{createdAt:'desc'},{id:'asc'}]});
     return {windowCapped:rows.length>100,proposals:rows.slice(0,100).map(row=>({approvalId:row.id,decision:row.decision,
      ...readPriceProposal(row),expired:!!row.scopeExpiresAt&&row.scopeExpiresAt<=new Date(),historicalOnly:true})),externalEffectsAuthorized:false};
    });
  }
  async createObjective(organizationId: string, actor: { userId: string; role: string } | undefined, input: { name: string; description: string }) {
    if (!actor || !['ADMIN', 'SUPER_ADMIN', 'MARKETING_DIRECTOR', 'CMO'].includes(actor.role.toUpperCase()))
      throw new ForbiddenException('Verified marketing manager role required to create objectives');
    const name = input.name?.trim(), description = input.description?.trim();
    if (!name || name.length < 3 || name.length > 160 || !description || description.length > 4000)
      throw new BadRequestException('Objective name (3–160) and description (1–4000) required');
    return withMarketingTenant(this.db,organizationId,async tx => {
      const objective = await tx.marketingObjective.create({ data: { organizationId, name, description } });
      await tx.auditEvent.create({ data: { organizationId, actorType: 'HUMAN', actorId: actor.userId, action: 'MARKETING_OBJECTIVE_CREATED', objectType: 'MarketingObjective', objectId: objective.id, after: { name, description }, correlationId: objective.id } });
      return { id: objective.id, name: objective.name, status: objective.status };
    });
  }
}
