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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit,OnModuleDestroy{
 async onModuleInit(){await this.$connect()}
 async onModuleDestroy(){await this.$disconnect()}
}
