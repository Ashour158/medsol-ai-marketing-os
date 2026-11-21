import {NextResponse} from 'next/server';

/** Public infrastructure probe: no credentials, tenant data, or session cookies. */
export async function GET(){
 try{
  const api=new URL('/readyz',process.env.MARKETING_API_INTERNAL_URL??'http://localhost:3001');
  const response=await fetch(api,{cache:'no-store',signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw Error('API not ready');
  return NextResponse.json({status:'ready',frontend:'reachable',api:'ready',
   independentAcceptanceVerified:false,productionCertified:false},{
   status:200,headers:{'cache-control':'no-store'}
  });
 }catch{
  return NextResponse.json({status:'unready',frontend:'reachable',api:'unavailable',
   independentAcceptanceVerified:false,productionCertified:false},{
   status:503,headers:{'cache-control':'no-store'}
  });
 }
}
