import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {hasMarketingPermission,isMarketingPermission,type MarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';

type RoleInput={key?:unknown;name?:unknown;permissions?:unknown};
const MAX_NAME=120;
const identifier=(v:unknown,name:string,max=128):string=>{
 if(typeof v!=='string'||v.length>max||!/^[A-Za-z0-9_-]{1,128}$/.test(v))
  throw new BadRequestException('Invalid '+name);
 return v;
};
const rolePermissions=(value:unknown):MarketingPermission[]=>{
 if(!Array.isArray(value)||value.length===0||value.length>12||
    !value.every(isMarketingPermission)||new Set(value).size!==value.length)
  throw new BadRequestException('Known, distinct role permissions required');
 return value;
};
/** Owns restrictive custom roles. User remains the only OIDC subject and
 *  existing static User.role remains an unbreakable permission ceiling.
 *  Requires trusted OIDC identity; never trusts role/tenant from HTTP body.
 */
@Injectable()
export class TenantRolePolicyService{
 constructor(private readonly db:PrismaService){}
 private transaction<T>(organizationId:string,work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  identifier(organizationId,'organization');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   return work(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async assertAdmin(tx:Prisma.TransactionClient,actor:VerifiedIdentity){
  const actual=await tx.user.findFirst({where:{id:actor.userId,organizationId:actor.organizationId,
   disabledAt:null},select:{role:true,oidcSubject:true}});
  if(!actual||!['ADMIN','SUPER_ADMIN'].includes(actual.role.toUpperCase())||
    actual.oidcSubject!==actor.subject||!hasMarketingPermission(actor,'MANAGE_TENANT'))
   throw new ForbiddenException('Active tenant administrator with matching OIDC identity required');
 }
 async list(organizationId:string,actor:VerifiedIdentity){
  if(organizationId!==actor.organizationId)throw new ForbiddenException('Cross-tenant role list denied');
  return this.transaction(organizationId,async tx=>{
   await this.assertAdmin(tx,actor);
   return tx.tenantRoleDefinition.findMany({where:{organizationId},take:100,orderBy:{createdAt:'desc'},
    select:{id:true,key:true,name:true,permissions:true,status:true,version:true,createdAt:true}});
  });
 }
 async create(actor:VerifiedIdentity,input:RoleInput){
  const organizationId=identifier(actor.organizationId,'organization');
  const key=identifier(input?.key,'role key',72).toLowerCase();
  if(!/^[a-z][a-z0-9_-]{2,71}$/.test(key))throw new BadRequestException('Role key must be URL-safe');
  const name=typeof input?.name==='string'?input.name.trim():'';
  if(name.length<3||name.length>MAX_NAME)throw new BadRequestException('Role name must be 3–120 characters');
  const permissions=rolePermissions(input?.permissions);
  try{
   return await this.transaction(organizationId,async tx=>{
    await this.assertAdmin(tx,actor);
    const role=await tx.tenantRoleDefinition.create({data:{id:randomUUID(),organizationId,
     key,name,permissions,createdBy:actor.userId}});
    await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId:actor.userId,
     action:'TENANT_ROLE_CREATED',objectType:'TenantRoleDefinition',objectId:role.id,
     correlationId:role.id,after:{key,permissions,version:1,restrictiveOnly:true}}});
    return{id:role.id,key,name,permissions,status:'ACTIVE',restrictiveOnly:true};
   });
  }catch(e){
   if((e as {code?:string}).code==='P2002')throw new ConflictException('Role key already exists');
   throw e;
  }
 }
 async assign(actor:VerifiedIdentity,userIdInput:unknown,roleIdInput:unknown){
  const organizationId=identifier(actor.organizationId,'organization');
  const userId=identifier(userIdInput,'user'),roleId=identifier(roleIdInput,'role');
  if(actor.userId===userId)throw new ForbiddenException('Self-assignment is not permitted');
  return this.transaction(organizationId,async tx=>{
   await this.assertAdmin(tx,actor);
   const [user,role]=await Promise.all([
    tx.user.findFirst({where:{id:userId,organizationId,disabledAt:null},
     select:{id:true,role:true,tenantRoleDefinitionId:true,oidcSubject:true}}),
    tx.tenantRoleDefinition.findFirst({where:{id:roleId,organizationId,status:'ACTIVE'},
     select:{id:true,permissions:true,key:true}})
   ]);
   if(!user||!role)throw new NotFoundException('Active user or role not found in this tenant');
   if(!user.oidcSubject)throw new ForbiddenException('User must have a provisioned OIDC binding');
   if(['ADMIN','SUPER_ADMIN'].includes(user.role.toUpperCase()))
    throw new ForbiddenException('Tenant administrators require separate privileged role governance');
   const desired=rolePermissions(role.permissions);
   const ceiling={userId,organizationId,role:user.role,email:'',subject:user.oidcSubject};
   if(desired.some(p=>!hasMarketingPermission(ceiling,p)))
    throw new ForbiddenException('Custom role exceeds provisioned built-in user authority');
   if(user.tenantRoleDefinitionId===roleId)return{userId,roleId,replay:true,sessionsRevoked:0};
   const changed=await tx.user.updateMany({where:{id:userId,organizationId,
    tenantRoleDefinitionId:user.tenantRoleDefinitionId},data:{tenantRoleDefinitionId:roleId}});
   if(changed.count!==1)throw new ConflictException('Concurrent user role reassignment');
   const sessions=await tx.authSession.updateMany({where:{organizationId,userId,revokedAt:null},
    data:{revokedAt:new Date()}});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId:actor.userId,
    action:'TENANT_ROLE_ASSIGNED',objectType:'User',objectId:userId,correlationId:randomUUID(),
    before:{roleDefinitionId:user.tenantRoleDefinitionId},
    after:{roleDefinitionId:roleId,permissions:desired,sessionsRevoked:sessions.count}}});
   return{userId,roleId,replay:false,sessionsRevoked:sessions.count};
  });
 }
 async disable(actor:VerifiedIdentity,roleIdInput:unknown,reasonInput:unknown){
  const organizationId=identifier(actor.organizationId,'organization'),roleId=identifier(roleIdInput,'role');
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)throw new BadRequestException('Valid 12–500 character reason required');
  return this.transaction(organizationId,async tx=>{
   await this.assertAdmin(tx,actor);
   const role=await tx.tenantRoleDefinition.findFirst({where:{id:roleId,organizationId},
    select:{id:true,status:true,version:true}});
   if(!role)throw new NotFoundException('Role not found in tenant');
   if(role.status==='DISABLED')return{roleId,disabled:true,replay:true};
   const changed=await tx.tenantRoleDefinition.updateMany({where:{id:roleId,organizationId,
    status:'ACTIVE',version:role.version},data:{status:'DISABLED',version:{increment:1}}});
   if(changed.count!==1)throw new ConflictException('Role changed concurrently');
   const assigned=await tx.user.findMany({where:{organizationId,tenantRoleDefinitionId:roleId},
    select:{id:true}});
   const userIds=assigned.map(x=>x.id);
   if(userIds.length)await tx.authSession.updateMany({where:{organizationId,userId:{in:userIds},
    revokedAt:null},data:{revokedAt:new Date()}});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId:actor.userId,
    action:'TENANT_ROLE_DISABLED',objectType:'TenantRoleDefinition',objectId:roleId,
    correlationId:randomUUID(),before:{status:'ACTIVE',version:role.version},
    after:{status:'DISABLED',version:role.version+1,reason,affectedUsers:userIds.length}}});
   return{roleId,disabled:true,replay:false,affectedUsers:userIds.length};
  });
 }
 async assertActorPermission(actor:VerifiedIdentity,permission:MarketingPermission):Promise<void>{
  if(!hasMarketingPermission(actor,permission))
   throw new ForbiddenException('Marketing permission denied: '+permission);
  await this.transaction(actor.organizationId,async tx=>{
   // Recheck current User state on every authorized API call rather than
   // trusting a stale role in an otherwise valid JWT/session.
   const user=await tx.user.findFirst({where:{id:actor.userId,organizationId:actor.organizationId,
    disabledAt:null,oidcSubject:actor.subject},select:{
     role:true,tenantRoleDefinitionId:true}});
   if(!user||user.role.toUpperCase()!==actor.role.toUpperCase())
    throw new ForbiddenException('OIDC user permissions changed or disabled');
   if(!user.tenantRoleDefinitionId){
    if(process.env.MARKETING_REQUIRE_TENANT_ROLE==='true'&&
       !['ADMIN','SUPER_ADMIN'].includes(user.role.toUpperCase()))
     throw new ForbiddenException('Explicit tenant role assignment required');
    return;
   }
   const role=await tx.tenantRoleDefinition.findFirst({where:{id:user.tenantRoleDefinitionId,
    organizationId:actor.organizationId,status:'ACTIVE'},select:{permissions:true}});
   if(!role||!Array.isArray(role.permissions)||!role.permissions.includes(permission))
    throw new ForbiddenException('Tenant role policy denies: '+permission);
  });
 }
}
