import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {AgentManifestReleaseService} from './agent-manifest-release.service.js';
import {AgentService} from './agent.service.js';
import {agentReleaseDigest,baselineAgentReleaseManifest}
 from './agent-manifest-release.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('R3-F signed agent release PostgreSQL and runtime acceptance',()=>{
 it.skipIf(!enabled)('enforces review, tenant isolation, active version, rollback and no external effects',async()=>{
  const db=new PrismaClient(),org='r3f-'+randomUUID(),
   other='r3f-foreign-'+randomUUID(),maker='r3f-maker-'+randomUUID(),
   checker='r3f-checker-'+randomUUID(),sub1='subject-'+randomUUID(),
   sub2='subject-'+randomUUID();
  const keys=generateKeyPairSync('ed25519');
  const prevKey=process.env.MARKETING_AGENT_RELEASE_TRUSTED_PUBLIC_KEY_PEM;
  const prevId=process.env.MARKETING_AGENT_RELEASE_TRUSTED_KEY_ID;
  process.env.MARKETING_AGENT_RELEASE_TRUSTED_PUBLIC_KEY_PEM=
   keys.publicKey.export({type:'spki',format:'pem'}).toString();
  process.env.MARKETING_AGENT_RELEASE_TRUSTED_KEY_ID='approved-key';
  const actor=(id:string,sub:string,tenant=org)=>({
   userId:id,organizationId:tenant,subject:sub,role:'ADMIN',
   email:id+'@example.invalid'});
  const author=actor(maker,sub1),reviewer=actor(checker,sub2);
  const baseline=baselineAgentReleaseManifest('MKT-CMO-001');
  const manifest={...baseline,mission:'Review restricted strategic priorities and evidence.',
   capabilities:['ASSESS_OBJECTIVE'],knowledgeKeys:['reviewed_sources'],
   skillKeys:['market_review']};
  const signature=sign(null,Buffer.from('medsol-agent-release-signature-v1\n'+
   agentReleaseDigest(manifest)),keys.privateKey).toString('base64url');
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'Agent Revision Tenant'},
    {id:other,name:'Foreign Agent Revision Tenant'}]});
   await db.user.createMany({data:[
    {id:maker,organizationId:org,email:author.email,name:'Maker',
     role:'ADMIN',oidcSubject:sub1},
    {id:checker,organizationId:org,email:reviewer.email,name:'Reviewer',
     role:'ADMIN',oidcSubject:sub2}]});
   const releases=new AgentManifestReleaseService(db as any);
   const proposed=await releases.propose(org,author,{
    manifest,signature,signerKeyId:'approved-key'});
   expect(proposed).toMatchObject({revision:2,status:'PROPOSED',
    signatureTrusted:true,replayed:false,externalEffectsAuthorized:false});
   const duplicate=await releases.propose(org,author,{
    manifest,signature,signerKeyId:'approved-key'});
   expect(duplicate).toMatchObject({id:proposed.id,replayed:true});
   await expect(releases.approve(org,author,proposed.id,2))
    .rejects.toThrow('Independent');
   await expect(releases.approve(org,actor(checker,'forged'),proposed.id,2))
    .rejects.toThrow('matching');
   await expect(releases.list(other,author)).rejects.toThrow('tenant');
   await expect(releases.activate(org,reviewer,proposed.id,1))
    .rejects.toThrow('Approved');
   const approved=await releases.approve(org,reviewer,proposed.id,2);
   expect(approved).toMatchObject({status:'APPROVED',
    signatureTrusted:true});
   await expect(releases.approve(org,reviewer,proposed.id,2))
    .rejects.toThrow('no longer');
   const active=await releases.activate(org,reviewer,proposed.id,1);
   expect(active).toMatchObject({activeVersion:2,replayed:false,
    releaseDigest:agentReleaseDigest(manifest)});
   expect((await db.agent.findFirst({where:{organizationId:org,
    id:manifest.agentId}}))?.version).toBe(2);
   await expect(releases.activate(org,reviewer,proposed.id,1))
    .rejects.toThrow('Stale');
   const runtime=new AgentService(db as any);
   const executed=await runtime.execute(manifest.agentId,{organizationId:org,
    correlationId:'r3f-safe-execution',capabilities:['ASSESS_OBJECTIVE'],
    input:{objective:'Evidence-based market focus'}});
   expect(executed.decision).toMatchObject({
    releaseEvidence:{version:2,releaseDigest:undefined}
   });
  }finally{
   if(prevKey===undefined)delete process.env.MARKETING_AGENT_RELEASE_TRUSTED_PUBLIC_KEY_PEM;
   else process.env.MARKETING_AGENT_RELEASE_TRUSTED_PUBLIC_KEY_PEM=prevKey;
   if(prevId===undefined)delete process.env.MARKETING_AGENT_RELEASE_TRUSTED_KEY_ID;
   else process.env.MARKETING_AGENT_RELEASE_TRUSTED_KEY_ID=prevId;
   await db.$disconnect();
  }
 },90000);
 it('exposes no agent release route for network dispatch or self-signing',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/agents/manifests'))
   .toBe('READ_TENANCY');
  for(const verb of ['approve','activate','rollback','revoke']){
   expect(permissionForMarketingRoute('POST','/marketing/agents/manifests/id/'+verb))
    .toBe('MANAGE_TENANT');
  }
  expect(()=>permissionForMarketingRoute('POST','/marketing/agents/manifests/id/execute'))
   .toThrow();
 });
});
