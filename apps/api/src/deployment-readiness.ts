import {assertRuntimeDatabaseRole} from './prisma.service.js';

export type RuntimeRole = {
 rolsuper:boolean;rolbypassrls:boolean;rolcreaterole:boolean;rolcreatedb:boolean;
};

/**
 * A live read query must have succeeded to obtain these roles.
 * Production must use the same non-BYPASSRLS rule as PrismaService startup.
 * Keep this check independent from release certification and third-party uptime.
 */
export function ensureRuntimeReady(rows:readonly RuntimeRole[],production:boolean){
 if(rows.length!==1||!rows[0])throw new Error('Database role probe unavailable');
 if(production)assertRuntimeDatabaseRole(rows);
 return{
  status:'ready' as const,service:'medsol-ai-marketing-api',
  database:'reachable' as const,restrictedRoleVerified:production,
  realProviderOperationsVerified:false,productionCertified:false
 };
}
