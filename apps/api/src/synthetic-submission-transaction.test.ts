import {Prisma} from '@prisma/client';
import {describe,it,expect,vi} from 'vitest';
import {retryAbortedSyntheticConversion} from './synthetic-submission-transaction.js';
const error=(code:string)=>new Prisma.PrismaClientKnownRequestError('fixture database error',{code,clientVersion:'test'});
describe('synthetic conversion transaction abortion',()=>{
 it('restarts only a confirmed serialization abort and returns the committed result',async()=>{
  const operation=vi.fn<()=>Promise<string>>().mockRejectedValueOnce(error('P2034')).mockResolvedValueOnce('committed');
  expect(await retryAbortedSyntheticConversion(operation)).toBe('committed');
  expect(operation).toHaveBeenCalledTimes(2);
 });
 it('bounds repeated serialization failures to three attempts',async()=>{
  const aborted=error('P2034'), operation=vi.fn<()=>Promise<never>>().mockRejectedValue(aborted);
  await expect(retryAbortedSyntheticConversion(operation)).rejects.toBe(aborted);
  expect(operation).toHaveBeenCalledTimes(3);
 });
 it('does not retry uniqueness conflicts or unknown failures',async()=>{
  for(const failure of [error('P2002'),new Error('unknown outcome')]){
   const operation=vi.fn<()=>Promise<never>>().mockRejectedValue(failure);
   await expect(retryAbortedSyntheticConversion(operation)).rejects.toBe(failure);
   expect(operation).toHaveBeenCalledTimes(1);
  }
 });
 it('rechecks guards on restart and never retries a newly denied operation',async()=>{
  const denied=new Error('consent withdrawn'),operation=vi.fn<()=>Promise<never>>().mockRejectedValueOnce(error('P2034')).mockRejectedValueOnce(denied);
  await expect(retryAbortedSyntheticConversion(operation)).rejects.toBe(denied);
  expect(operation).toHaveBeenCalledTimes(2);
 });
});
