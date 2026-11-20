import {Prisma,PrismaClient} from '@prisma/client';
import {BadRequestException,Injectable,OnModuleDestroy,OnModuleInit} from '@nestjs/common';

/**
 * Reusable infrastructure primitive: one transaction-local tenant context.
 * Never accepts a tenant from request bodies; callers pass the trusted OIDC
 * organization's ID. A transaction is mandatory because pooled session-level
 * SET would leak context between unrelated requests.
 */
export function withMarketingTenant<T>(
 db:PrismaClient,organizationId:string,
 work:(tx:Prisma.TransactionClient)=>Promise<T>,
 options?:{isolationLevel?:Prisma.TransactionIsolationLevel}
):Promise<T>{
 if(typeof organizationId!=='string'||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(organizationId))
  throw new BadRequestException('Trusted tenant context required');
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
  return work(tx);
 },options);
}

/**
 * Prevent deployment of a runtime database role that silently bypasses
 * PostgreSQL FORCE RLS. Migrations use a separate privileged principal.
 * This does not certify all tenant tables or operator network entitlements.
 */
export function assertRuntimeDatabaseRole(rows:readonly {
 rolsuper:boolean;rolbypassrls:boolean;rolcreaterole:boolean;rolcreatedb:boolean
}[]):void{
 const role=rows[0];
 if(rows.length!==1||!role||
    role.rolsuper!==false||role.rolbypassrls!==false||
    role.rolcreaterole!==false||role.rolcreatedb!==false)
  throw new Error('Production marketing database role must be unprivileged and NON-BYPASSRLS');
}
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit,OnModuleDestroy{
 async onModuleInit(){
  await this.$connect();
  if(process.env.NODE_ENV==='production'){
   const rows=await this.$queryRaw<Array<{
    rolsuper:boolean;rolbypassrls:boolean;rolcreaterole:boolean;rolcreatedb:boolean
   }>>`SELECT r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb
       FROM pg_roles r WHERE r.rolname=current_user`;
   assertRuntimeDatabaseRole(rows);
  }
 }
 async onModuleDestroy(){await this.$disconnect()}
}
