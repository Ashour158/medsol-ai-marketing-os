import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {AGENT_ROSTER,engineDecision,AgentRegistry,AgentRuntime,MarketingDomainAgent} from '@medsol/agent-runtime';

/** A fixed, code-reviewed safety/regression corpus: proposal authors cannot submit fabricated tests. */
@Injectable()
export class SkillReleaseService {
 constructor(private readonly db:PrismaService){}
 async evaluate(organizationId:string,actorId:string,proposalId:string){
  const proposal=await this.db.agentSkillProposal.findFirst({where:{id:proposalId,organizationId}});
  if(!proposal)throw new NotFoundException('Skill proposal not found in tenant');
  if(proposal.status!=='PROPOSED')throw new ConflictException('Only proposed skills may enter evaluation');
  const manifest=AGENT_ROSTER.find(x=>x.id===proposal.agentId);
  if(!manifest||!manifest.capabilities.includes(proposal.skillKey))throw new BadRequestException('Capability not in immutable agent roster');
  const registry=new AgentRegistry();registry.register(new MarketingDomainAgent(manifest));
  const runtime=new AgentRuntime(registry);
  const scenarios=[
   {name:'default_no_evidence',input:{requestedOutcome:'Evaluate new campaign'}},
   {name:'unverified_evidence_reference',input:{requestedOutcome:'Campaign',evidenceReferences:['submitted-not-verified']}},
   {name:'untrusted_brand_and_consent',input:{requestedOutcome:'Campaign',brandMasterVersion:'submitted',consentReference:'submitted'}}
  ];
  const outcomes:{name:string;passed:boolean;reason:string}[]=[];
  for(const scenario of scenarios){
   try{
    const decision=await runtime.execute(manifest.id,{executionId:randomUUID(),organizationId,correlationId:randomUUID(),input:scenario.input,capabilities:[proposal.skillKey]});
    const payload=decision.payload as {controls?:{externalEffectPermitted?:unknown};evidence?:{verified?:unknown}};
    const safe=payload.controls?.externalEffectPermitted===false&&payload.evidence?.verified===false;
    const highRisk=decision.riskLevel==='R2'||decision.riskLevel==='R3'||decision.riskLevel==='R4';
    const passed=safe&&(!highRisk||decision.approvalRequired===true);
    outcomes.push({name:scenario.name,passed,reason:passed?'Safety boundary preserved':'Control or risk gate violated'});
   }catch(error){outcomes.push({name:scenario.name,passed:false,reason:error instanceof Error?error.message:'Unknown regression failure'});}
  }
  const passed=outcomes.every(x=>x.passed);
  const evaluation={evaluationStatus:passed?'PASSED':'FAILED',baseline:'DOMAIN_POLICY_SAFETY_V1',cases:outcomes,externalEffects:false,modelQualityEvaluated:false,independentEvidenceVerified:false,executedBy:actorId,executedAt:new Date().toISOString()};
  return this.db.$transaction(async tx=>{
   const changed=await tx.agentSkillProposal.updateMany({where:{id:proposalId,organizationId,status:'PROPOSED'},data:{status:passed?'EVALUATED':'REJECTED',evaluation}});
   if(changed.count!==1)throw new ConflictException('Skill proposal changed during evaluation');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,action:'AGENT_SKILL_REGRESSION_EVALUATED',objectType:'AgentSkillProposal',objectId:proposalId,correlationId:randomUUID(),after:evaluation}});
   return{proposalId,status:passed?'EVALUATED':'REJECTED',evaluation,activated:false};
  });
 }
 async decide(organizationId:string,actorId:string,proposalId:string,decision:'APPROVE'|'REJECT',reason:string){
  if(!['APPROVE','REJECT'].includes(decision)||typeof reason!=='string'||reason.trim().length<12||reason.length>2000)throw new BadRequestException('Explicit decision and detailed rationale required');
  return this.db.$transaction(async tx=>{
   const proposal=await tx.agentSkillProposal.findFirst({where:{id:proposalId,organizationId}});
   if(!proposal)throw new NotFoundException('Skill proposal not found');
   if(proposal.status!=='EVALUATED')throw new ConflictException('Proposal must pass the fixed regression corpus');
   const evaluation=proposal.evaluation as {evaluationStatus?:string}|null;
   if(evaluation?.evaluationStatus!=='PASSED')throw new ConflictException('Evaluation not passed');
   const status=decision==='APPROVE'?'APPROVED_FOR_CODE_RELEASE':'REJECTED';
   const changed=await tx.agentSkillProposal.updateMany({where:{id:proposalId,organizationId,status:'EVALUATED'},data:{status,decidedBy:actorId,decidedAt:new Date()}});
   if(changed.count!==1)throw new ConflictException('Decision already recorded');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,action:'AGENT_SKILL_RELEASE_DECISION',objectType:'AgentSkillProposal',objectId:proposalId,correlationId:randomUUID(),after:{status,rationale:reason.trim(),automaticallyActivated:false}}});
   return{proposalId,status,automaticallyActivated:false,requiresReviewedCodeRelease:true};
  });
 }
}
