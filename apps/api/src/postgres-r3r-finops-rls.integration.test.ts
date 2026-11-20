import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {withMarketingTenant} from './prisma.service.js';
import {ModelBudgetService} from './model-budget.service.js';
import {ModelReconciliationService} from './model-reconciliation.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const org=(name:string)=>'r3r-finops-'+name+'-'+randomUUID();
const TABLES=['ModelBudget','ModelUsage'] as const;
async function tenantSeed(db:PrismaClient,organizationId:string){
 await db.organization.create({data:{id:organizationId,name:'Synthetic FinOps tenant'}});
 await withMarketingTenant(db,organizationId,async tx=>{
  await tx.modelBudget.create({data:{organizationId,limitMicros:100000n}});
  await tx.modelUsage.create({data:{organizationId,requestId:'seed-'+randomUUID(),
   agentId:'MKT-CMO-001',reservedMicros:100n,status:'RELEASED'}});
 });
}
async function countAs(db:PrismaClient,principal:string,tenant:string|null){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
  if(tenant)await tx.$queryRawUnsafe(
   "SELECT set_config('app.marketing_tenant_id',$1,true)",tenant);
  const output:number[]=[];
  for(const table of TABLES){
   const rows=await tx.$queryRawUnsafe<Array<{n:number}>>(
    'SELECT count(*)::int AS n FROM "'+table+'"');
   output.push(rows[0]?.n??-1);
  }
  return output;
 });
}
describe.skipIf(!enabled)('R3-R real PostgreSQL tenant model budget / usage isolation',()=>{
 it('T01-014 FORCE RLS hides finance data without tenant context or from other tenants',async()=>{
  const db=new PrismaClient(),a=org('a'),b=org('b');
  const role='r3r_finance_'+randomUUID().replaceAll('-','').slice(0,15);
  let roleCreated=false;
  try{
   await db.$connect();
   await tenantSeed(db,a);await tenantSeed(db,b);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   roleCreated=true;
   for(const table of TABLES)await db.$executeRawUnsafe(
    'GRANT SELECT,INSERT,UPDATE,DELETE ON "'+table+'" TO "'+role+'"');
   expect(await countAs(db,role,null)).toEqual([0,0]);
   expect(await countAs(db,role,a)).toEqual([1,1]);
   expect(await countAs(db,role,b)).toEqual([1,1]);
   expect(await countAs(db,role,null)).toEqual([0,0]);
   const crossTenant=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    await tx.$queryRawUnsafe(
     "SELECT set_config('app.marketing_tenant_id',$1,true)",a);
    return tx.$executeRawUnsafe('UPDATE "ModelBudget" SET "limitMicros"=0 WHERE "organizationId"=$1',b);
   });
   expect(crossTenant).toBe(0);
   const forbiddenDelete=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    await tx.$queryRawUnsafe(
     "SELECT set_config('app.marketing_tenant_id',$1,true)",a);
    return tx.$executeRawUnsafe('DELETE FROM "ModelUsage" WHERE "organizationId"=$1',a);
   });
   expect(forbiddenDelete).toBe(0);
   await expect(db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    return tx.$executeRawUnsafe(
     'INSERT INTO "ModelUsage"("id","organizationId","requestId","agentId","reservedMicros","status") VALUES ($1,$2,$3,$4,0,$5)',
     randomUUID(),a,randomUUID(),'MKT-CMO-001','RESERVED');
   })).rejects.toThrow();
  }finally{
   if(roleCreated){
    for(const table of TABLES)await db.$executeRawUnsafe(
     'REVOKE ALL ON "'+table+'" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },90000);
 it('T14-002 canonical finance reserve/settle/verified invoice remain tenant-scoped and do not call providers',async()=>{
  const db=new PrismaClient(),a=org('owner'),b=org('other');
  try{
   await db.$connect();await tenantSeed(db,a);await tenantSeed(db,b);
   const model=new ModelBudgetService(db as any);
   const billing=new ModelReconciliationService(db as any);
   const requestId='r3r-reserve-'+randomUUID();
   const receipt=await model.reserve({organizationId:a,requestId,agentId:'MKT-CMO-001',costMicros:1000});
   expect(receipt.replay).toBe(false);
   const again=await model.reserve({organizationId:a,requestId,agentId:'MKT-CMO-001',costMicros:1000});
   expect(again).toMatchObject({id:receipt.id,replay:true});
   expect(await model.settle(a,receipt.id,{actualCostMicros:600,model:'offline-fake-model',
    inputTokens:11,outputTokens:12})).toMatchObject({status:'SETTLED',replay:false});
   expect(await model.settle(a,receipt.id,null)).toMatchObject({replay:true});
   await expect(model.settle(b,receipt.id,null)).rejects.toThrow('not found in tenant');
   const confirmed=await billing.verifySettledInvoice({
    organizationId:a,usageId:receipt.id,providerRequestId:'offline-provider-'+requestId,
    evidenceReference:'synthetic-invoice-not-real-'+requestId,
    actualCostMicros:650,model:'offline-fake-model',inputTokens:11,outputTokens:12
   });
   expect(confirmed).toMatchObject({billingStatus:'VERIFIED',financeReviewRequired:true,
    verifiedBilledMicros:'650',estimatedMicros:'600'});
   expect(await model.summary(a)).toMatchObject({enabled:true,spentMicros:'600',
    verifiedBilledMicros:'650',verifiedInvoiceCount:1,requiresExternalBillingReconciliation:false});
   expect(await model.summary(b)).toMatchObject({enabled:true,spentMicros:'0',
    verifiedBilledMicros:'0'});
   const usage=await withMarketingTenant(db,a,tx=>tx.modelUsage.findFirstOrThrow({
    where:{id:receipt.id,organizationId:a}}));
   expect(usage.billingStatus).toBe('VERIFIED');
   expect(usage.providerRequestId).toMatch(/^offline-provider-/);
   // CI fixture uses a privileged migration role; always apply canonical tenant predicate here.
   // T01-014 separately verifies actual FORCE RLS with a non-BYPASSRLS principal.
   expect(await withMarketingTenant(db,b,tx=>tx.modelUsage.count({where:{id:receipt.id,organizationId:b}}))).toBe(0);
   expect(await db.publicationAttempt.count({where:{organizationId:a,mode:'REMOTE'}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
});
