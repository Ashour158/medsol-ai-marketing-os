/** CI-only packaged HTTPS proxy and protocol-level login checks.
 * Reuses the canonical disposable OIDC fixture; no browser/independent QA claim.
 */
import {createServer} from 'node:https';
import {request} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getBrainPlan,nextAgentCapability} from '@medsol/agent-runtime';
import {disposableOidcCiAllowed} from '@medsol/contracts';
const issuer='https://127.0.0.1:3215',origin='https://127.0.0.1:3443';
if(!disposableOidcCiAllowed(issuer,process.env)||process.env.MARKETING_T1E_STAGING_CI_ONLY!=='1')
 throw Error('Disposable isolated GitHub CI only');
if(process.argv[2]==='proxy'){
 const server=createServer({key:readFileSync('/tmp/medsol-r3y-jwks/key.pem'),cert:readFileSync('/tmp/medsol-r3y-jwks/cert.pem')},(req,res)=>{
  const upstream=request({hostname:'127.0.0.1',port:3000,method:req.method,path:req.url,
   headers:{...req.headers,host:'127.0.0.1:3443','x-forwarded-proto':'https'}},r=>{
    res.writeHead(r.statusCode??502,r.headers);r.pipe(res);
   });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(upstream);
 });
 server.listen(3443,'127.0.0.1');
}else if(process.argv[2]==='verify'){
 const get=(url,options={})=>fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),...options});
 const follow=(r,expected)=>{assert.ok([302,303,307,308].includes(r.status));const u=new URL(r.headers.get('location'),origin);assert.equal(u.origin,expected);return u.href};
 const cookie=(r,name)=>{
  const raw=r.headers.getSetCookie().find(c=>c.startsWith(name+'='));
  // Never include cookie values in assertion output.
  if(!raw||! /;\s*Secure(?:;|$)/i.test(raw)||! /;\s*HttpOnly(?:;|$)/i.test(raw))throw Error('Expected secure HTTP-only cookie missing');
  return raw.split(';',1)[0];
 };
 const bff=(path,session,opts={})=>get(origin+'/api/marketing/'+path,{...opts,headers:{...opts.headers,cookie:session}});
 async function login(persona){
  assert.equal((await get('http://127.0.0.1:3216/__select-persona?persona='+persona,{method:'POST'})).status,200);
  const start=await get(origin+'/api/auth/login');
  const flow=cookie(start,'__Host-medsol_oidc_flow');
  const auth=await get(follow(start,issuer));
  const callback=await get(follow(auth,origin),{headers:{cookie:flow}});
  const target=new URL(follow(callback,origin));
  assert.equal(target.pathname,'/');assert.equal(target.search,'');
  return cookie(callback,'__Host-medsol_session');
 }
 assert.equal((await get(origin+'/api/marketing/me')).status,401);
 const admin=await login('admin');
 const me=await bff('me',admin);assert.equal(me.status,200);
 const identity=await me.json();assert.equal(identity.userId,'t1e-stage-admin');assert.equal(identity.organizationId,'r3y-tenant-a');assert.equal(identity.role,'ADMIN');
 const brands=await bff('tenancy/brands',admin);assert.equal(brands.status,200);assert.ok((await brands.json()).some(b=>b.id==='r3y-stage-brand'));
 // Run real queued work, not just heartbeat. No execute endpoint or mock DB.
 const command={commandKey:'alpha-worker-'+randomUUID(),requestedOutcome:'Prepare a synthetic internal life sciences campaign assessment without external effects'};
 const created=await bff('brain/runs',admin,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(command)});
 assert.equal(created.status,201);const queued=await created.json();
 assert.ok(queued.id);
 const expected=getBrainPlan().stages.flatMap(stage=>stage.agents.map(agentId=>({agentId,stage:stage.stage})));
 assert.equal(expected.length,13);assert.equal(new Set(expected.map(s=>s.agentId)).size,13);
 let run;
 const deadline=Date.now()+90000;
 do{
  const response=await bff('brain/runs/'+queued.id,admin);assert.equal(response.status,200);run=await response.json();
  if(run.status==='REVIEW_REQUIRED')break;
  if(!['PENDING','RUNNING'].includes(run.status))throw Error('Packaged dispatcher failed to complete reviewed run: '+run.status);
  await new Promise(resolve=>setTimeout(resolve,1000));
 }while(Date.now()<deadline);
 assert.equal(run.status,'REVIEW_REQUIRED');
 assert.equal(run.steps.length,13);
 let previous=null;const ids=new Set();
 for(const [ordinal,step] of run.steps.entries()){
  assert.equal(step.ordinal,ordinal);assert.equal(step.agentId,expected[ordinal].agentId);assert.equal(step.stage,expected[ordinal].stage);
  assert.equal(step.status,'COMPLETED');assert.ok(step.executionId);assert.ok(!ids.has(step.executionId));ids.add(step.executionId);
  const res=await bff('agents/executions/'+step.executionId,admin);assert.equal(res.status,200);const e=await res.json();
  assert.equal(e.organizationId,'r3y-tenant-a');assert.equal(e.agentId,step.agentId);assert.equal(e.correlationId,run.correlationId);
  assert.equal(e.causationId,previous);assert.equal(e.status,'COMPLETED');
  assert.equal(e.decision.agentId,step.agentId);assert.equal(e.decision.action,nextAgentCapability(step.agentId));
  assert.equal(e.decision.executionAllowed,true);assert.equal(e.decision.payload.engine,step.agentId);
  assert.equal(e.decision.payload.evidence.verified,false);assert.equal(e.decision.payload.controls.externalEffectPermitted,false);
  assert.equal(e.decision.releaseEvidence.modelCallsAuthorized,false);assert.equal(e.decision.releaseEvidence.toolCallsAuthorized,false);
  assert.equal(e.decision.releaseEvidence.externalEffectsAuthorized,false);assert.equal(e.decision.payload.reasoningDraft,undefined);
  if(step.agentId==='MKT-SCI-001'){assert.equal(e.decision.payload.state,'INSUFFICIENT_EVIDENCE');assert.equal(e.decision.approvalRequired,true)}
  if(step.agentId==='MKT-CRM-001')assert.ok(e.decision.payload.controls.missing.includes('consent_reference'));
  previous=e.id;
 }
 const recovery=await bff('brain/runs/'+run.id+'/recovery',admin);assert.equal(recovery.status,200);
 const proof=await recovery.json();assert.equal(proof.completedSteps,13);assert.equal(proof.automaticReplayAllowed,false);
 assert.equal(proof.externalPublishingAuthorized,false);
 const viewer=await login('viewer');assert.equal((await bff('brain/runs/'+run.id,viewer)).status,403);
assert.equal((await bff('approvals/pending',viewer)).status,403);
 const foreign=await login('foreign');const other=await bff('tenancy/brands',foreign);assert.equal(other.status,200);assert.ok(!(await other.json()).some(b=>b.id==='r3y-stage-brand'));
 assert.equal((await bff('brain/runs/'+run.id,foreign)).status,404);
 assert.equal((await bff('agents/executions/'+run.steps[0].executionId,foreign)).status,404);
 const logout=await get(origin+'/api/auth/logout',{method:'POST',headers:{origin,cookie:admin}});assert.equal(logout.status,200);
 assert.equal((await bff('me',admin)).status,401);
 console.log(JSON.stringify({schema:'medsol-alpha-packaged-login-v1',signedPkce:true,trustedFixtureTls:true,anonymousDenied:true,
 administratorAuthenticated:true,viewerDenied:true,crossTenantBrandDenied:true,revokedSessionDenied:true,
 all13AgentDecisionsVerified:true,orderedCausationVerified:true,workerExecutedQueuedRun:true,realProviderConnections:0,classification:'DISPOSABLE_CI_PROTOCOL_TEST_NOT_DEPLOYED'}));
}else throw Error('Expected proxy or verify mode');
