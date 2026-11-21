import {describe,expect,it,vi,afterEach} from 'vitest';
import {GET} from './route';

afterEach(()=>vi.unstubAllGlobals());
describe('web-to-API readiness endpoint',()=>{
 it('returns ready only after upstream returns success, without leaking data',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true,status:200});
  vi.stubGlobal('fetch',fetcher);
  const response=await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
   status:'ready',frontend:'reachable',api:'ready',
   independentAcceptanceVerified:false,productionCertified:false
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(String(fetcher.mock.calls[0]![0])).toContain('/readyz');
 });
 it('fails closed on a dead, slow or unavailable API',async()=>{
  for(const behavior of [Promise.reject(Error('offline')),Promise.resolve({ok:false,status:503})]){
   vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>behavior));
   const response=await GET();
   expect(response.status).toBe(503);
   expect((await response.json()).productionCertified).toBe(false);
  }
 });
});
