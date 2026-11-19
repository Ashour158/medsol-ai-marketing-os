import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {AgentService} from './agent.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('PostgreSQL multi-tenant agent authority',()=>{
 it('T05-001 runs the same logical agent for two tenants without cross-tenant identity or execution borrowing',async()=>{
  const db=new PrismaClient();
  const organizationA='agent-tenant-a-'+randomUUID();
  const organizationB='agent-tenant-b-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:organizationA,name:'Tenant A'},{id:organizationB,name:'Tenant B'}]});
   const service=new AgentService(db as any);
   const request={correlationId:'test-'+randomUUID(),input:{requestedOutcome:'Market education'},capabilities:['ASSESS_OBJECTIVE']};
   const a=await service.execute('MKT-CMO-001',{...request,organizationId:organizationA});
   const b=await service.execute('MKT-CMO-001',{...request,organizationId:organizationB});
   expect(a.decision.agentId).toBe('MKT-CMO-001');
   expect(b.decision.agentId).toBe('MKT-CMO-001');
   expect(await db.agent.count({where:{id:'MKT-CMO-001',organizationId:{in:[organizationA,organizationB]}}})).toBe(2);
   expect(await db.agentExecution.count({where:{organizationId:organizationA,agentId:'MKT-CMO-001'}})).toBe(1);
   expect(await db.agentExecution.count({where:{organizationId:organizationB,agentId:'MKT-CMO-001'}})).toBe(1);
   // A second logical agent installed ONLY in tenant A must not satisfy a tenant B FK.
   await service.execute('MKT-STR-001',{organizationId:organizationA,correlationId:'strategy-'+randomUUID(),
     input:{requestedOutcome:'Market education'},capabilities:['ASSESS_MARKET']});
   await expect(db.agentExecution.create({data:{organizationId:organizationB,agentId:'MKT-STR-001',
     correlationId:'forged',status:'RUNNING',input:{}}})).rejects.toThrow();
   await db.agent.update({where:{organizationId_id:{organizationId:organizationA,id:'MKT-CMO-001'}},data:{status:'PAUSED'}});
   await expect(service.execute('MKT-CMO-001',{...request,organizationId:organizationA})).rejects.toThrow('paused');
   await expect(service.execute('MKT-CMO-001',{...request,organizationId:organizationB})).resolves.toHaveProperty('executionId');
  }finally{
   await db.agentExecution.deleteMany({where:{organizationId:{in:[organizationA,organizationB]}}});
   await db.agent.deleteMany({where:{organizationId:{in:[organizationA,organizationB]}}});
   await db.organization.deleteMany({where:{id:{in:[organizationA,organizationB]}}});
   await db.$disconnect();
  }
 },30000);
});
