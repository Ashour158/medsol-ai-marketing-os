import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {TenantRolePolicyService} from './tenant-role-policy.service.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('R1B PostgreSQL tenant role authority and scoped RLS',()=>{
 it('enforces two-tenant role assignment, live permission reduction, revoke and session invalidation',async()=>{
  const db=new PrismaClient();
  const a='r1b-a-'+randomUUID(),b='r1b-b-'+randomUUID();
  const adminId='admin-'+randomUUID(),userId='user-'+randomUUID();
  const admin={userId:adminId,organizationId:a,role:'ADMIN',
   email:'role-admin@example.invalid',subject:'oidc-'+adminId};
  const operator={userId,organizationId:a,role:'MARKETING_MANAGER',
   email:'role-user@example.invalid',subject:'oidc-'+userId};
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:a,name:'Role tenant A'},{id:b,name:'Role tenant B'}]});
   await db.user.createMany({data:[
    {id:adminId,organizationId:a,email:'admin@example.invalid',name:'Admin',
     role:'ADMIN',oidcSubject:admin.subject},
    {id:userId,organizationId:a,email:'user@example.invalid',name:'Manager',
     role:'MARKETING_MANAGER',oidcSubject:operator.subject}
   ]});
   await db.authSession.create({data:{id:randomUUID(),userId,organizationId:a,
    expiresAt:new Date(Date.now()+600000)}});
   const roles=new TenantRolePolicyService(db as any);
   const r=await roles.create(admin,{key:'content_team',name:'Content Team',
    permissions:['READ_PORTFOLIO','ASSESS']});
   expect(r.restrictiveOnly).toBe(true);
   expect((await roles.list(a,admin)).map(x=>x.key)).toEqual(['content_team']);
   await expect(roles.list(b,admin)).rejects.toThrow('Cross-tenant');
   await expect(roles.assign(admin,userId,'missing-from-tenant')).rejects.toThrow('not found');
   const assignment=await roles.assign(admin,userId,r.id);
   expect(assignment.sessionsRevoked).toBe(1);
   expect(await db.authSession.count({where:{organizationId:a,userId,revokedAt:null}})).toBe(0);
   await expect(roles.assertActorPermission(operator,'READ_PORTFOLIO')).resolves.toBeUndefined();
   await expect(roles.assertActorPermission(operator,'EXECUTE_WORKFLOW')).rejects.toThrow('Tenant role policy denies');
   await expect(roles.assertActorPermission(operator,'DECIDE_APPROVAL')).rejects.toThrow('Marketing permission denied');
   await db.user.update({where:{id:userId},data:{role:'VIEWER'}});
   await expect(roles.assertActorPermission(operator,'READ_PORTFOLIO')).rejects.toThrow('permissions changed');
   await db.user.update({where:{id:userId},data:{role:'MARKETING_MANAGER'}});
   expect((await roles.disable(admin,r.id,'Retire custom policy after approval review')).disabled).toBe(true);
   await expect(roles.assertActorPermission(operator,'READ_PORTFOLIO')).rejects.toThrow('Tenant role policy denies');
   expect((await roles.disable(admin,r.id,'Retire custom policy after approval review')).replay).toBe(true);
   expect(await db.auditEvent.count({where:{organizationId:a,
    action:{in:['TENANT_ROLE_CREATED','TENANT_ROLE_ASSIGNED','TENANT_ROLE_DISABLED']}}})).toBe(3);
  }finally{
   await db.auditEvent.deleteMany({where:{organizationId:{in:[a,b]}}});
   await db.authSession.deleteMany({where:{organizationId:{in:[a,b]}}});
   await db.user.deleteMany({where:{organizationId:{in:[a,b]}}});
   await db.tenantRoleDefinition.deleteMany({where:{organizationId:{in:[a,b]}}});
   await db.organization.deleteMany({where:{id:{in:[a,b]}}});
   await db.$disconnect();
  }
 },60000);
 it('FORCE RLS hides other tenants and missing context using a real non-BYPASSRLS PostgreSQL role',async()=>{
  const db=new PrismaClient();
  const a='rls-a-'+randomUUID(),b='rls-b-'+randomUUID();
  const name='rls_probe_'+randomUUID().replaceAll('-','').slice(0,20);
  let roleCreated=false;
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:a,name:'RLS A'},{id:b,name:'RLS B'}]});
   await db.$executeRawUnsafe('CREATE ROLE "'+name+'" NOLOGIN');
   roleCreated=true;
   await db.$executeRawUnsafe('GRANT SELECT ON "TenantRoleDefinition" TO "'+name+'"');
   const create=async(org:string,key:string)=>{
    await db.$transaction(async tx=>{
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
     await tx.tenantRoleDefinition.create({data:{id:randomUUID(),organizationId:org,
      key,name:key,permissions:['READ_PORTFOLIO'],createdBy:'test-admin'}});
    });
   };
   await create(a,'a-role');await create(b,'b-role');
   const observed=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+name+'"');
    const empty=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "TenantRoleDefinition"');
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${a}, true)`;
    const inScope=await tx.$queryRawUnsafe<Array<{organizationId:string}>>(
     'SELECT "organizationId" FROM "TenantRoleDefinition" ORDER BY "organizationId"');
    return{noContext:Number(empty[0]?.n),inScope};
   });
   expect(observed.noContext).toBe(0);
   expect(observed.inScope).toEqual([{organizationId:a}]);
   const afterward=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+name+'"');
    return tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "TenantRoleDefinition"');
   });
   expect(Number(afterward[0]?.n)).toBe(0);
  }finally{
   await db.tenantRoleDefinition.deleteMany({where:{organizationId:{in:[a,b]}}});
   await db.organization.deleteMany({where:{id:{in:[a,b]}}});
   if(roleCreated){
    await db.$executeRawUnsafe('REVOKE SELECT ON "TenantRoleDefinition" FROM "'+name+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+name+'"');
   }
   await db.$disconnect();
  }
 },60000);
});
