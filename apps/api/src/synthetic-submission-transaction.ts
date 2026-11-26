import {Prisma} from '@prisma/client';

/** Only retry a local transaction that PostgreSQL/Prisma has confirmed aborted.
 * Applicable only to synthetic conversion form/read/qualification/submission work.
 * Never retry a committed, ambiguous, or external CRM operation. The entire
 * tenant/permission/approval/consent check and immutable-key lookup reruns.
 */
export async function retryAbortedSyntheticConversion<T>(operation:()=>Promise<T>):Promise<T>{
 for(let attempt=0;attempt<3;attempt++){
  try{return await operation();}
  catch(e){
   if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2034'&&attempt<2){
    await new Promise<void>(resolve=>setTimeout(resolve,12*(attempt+1)));
    continue;
   }
   throw e;
  }
 }
 throw new Error('Unreachable transaction retry state');
}
