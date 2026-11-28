import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {seal,SESSION_COOKIE} from '../src/lib/marketing-auth';
import {randomUUID} from 'node:crypto';
const frontend='https://127.0.0.1:3443';
const api='http://127.0.0.1:3210';
const ctl='http://127.0.0.1:3216';
const brandId='r3y-stage-brand';
type Persona='admin'|'reviewer'|'viewer'|'foreign';
const tenant=(persona:Persona)=>persona==='foreign'?'r3y-tenant-b':'r3y-tenant-a';
const actor=(persona:Persona)=>'t1e-stage-'+persona;
async function login(page:Page,persona:Persona='admin'){
 // This selects a CI-disposable issuer fixture identity; real self-hosted
 // staging must authenticate real operators (no such selector in the app).
 // Select one synthetic individual in the isolated CI IdP, not via an
 // application query, browser trust header or public operator account.
 const pick=await page.request.post(ctl+'/__select-persona?persona='+persona);
 expect(pick.status()).toBe(200);
 expect((await pick.json()).disposableCiOnly).toBe(true);
 await page.goto('/api/auth/login');
 await expect(page).toHaveURL(frontend+'/');
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await expect(page.getByText('Signed in as '+actor(persona)+'@example.invalid'))
  .toBeVisible();
}
async function bff(page:Page,path:string,body?:unknown){
 return page.evaluate(async ({path,body,hasBody})=>{
  const r=await fetch('/api/marketing/'+path,{
   method:hasBody?'POST':'GET',credentials:'same-origin',
   ...(hasBody?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
  });
  return{status:r.status,data:await r.json()};
 },{path,body,hasBody:body!==undefined});
}
async function provisionedSession(request:APIRequestContext,persona:Persona){
 const r=await request.post(ctl+'/__issue?persona='+persona);
 expect(r.status()).toBe(200);
 const issued=await r.json();
 const expiresAt=Date.now()+8*60_000;
 const user=await request.post(api+'/marketing/sessions',{
  headers:{authorization:'Bearer '+issued.token,'x-organization-id':tenant(persona)},
  data:{expiresAt}
 });
 expect(user.status(),await user.text()).toBe(201);
 return{token:issued.token,sessionId:(await user.json()).sessionId,expiresAt};
}
test('T1E-001 real browser self-hosted staging OIDC login binds signed subject and org to DB',async({page},testInfo)=>{
 await login(page);
 const me=await bff(page,'me');
 expect(me.status).toBe(200);
 expect(me.data).toMatchObject({userId:actor('admin'),organizationId:tenant('admin'),
  role:'ADMIN'});
 const cookie=(await page.context().cookies(frontend))
  .find(c=>c.name===SESSION_COOKIE);
 expect(cookie?.httpOnly).toBe(true);
 expect(cookie?.secure).toBe(true);
 expect(cookie?.value.split('.')).toHaveLength(5);
 const overview=page.getByRole('region',{name:'Executive overview'});
 await expect(overview).toBeVisible();
 await testInfo.attach('alpha-desktop-overview',{body:await page.screenshot(),contentType:'image/png'});
 const nav=page.getByRole('navigation',{name:'Marketing workspaces'});
 await nav.getByRole('link',{name:'Agent brain & plans'}).click();
 await expect(page.locator('#portfolio')).toBeHidden();
 await page.getByRole('button',{name:'Load brain map',exact:true}).click();
 const map=page.getByRole('region',{name:'Visual agent and nervous system map'});
 await expect(map).toBeVisible();
 await expect(map.locator('button[aria-pressed]')).toHaveCount(13);
 await map.locator('button[aria-pressed]').last().click();
 await expect(map.locator('button[aria-pressed=true]')).toHaveCount(1);
 await testInfo.attach('alpha-agent-network',{body:await page.screenshot(),contentType:'image/png'});
 await nav.getByRole('link',{name:'Signed Agent Studio'}).click();
 await expect(page.locator('#agent-brain')).toBeHidden();
 await page.getByRole('button',{name:'Load canonical agents and releases'}).click();
 await page.getByRole('combobox',{name:'Canonical agent',exact:true}).selectOption('MKT-CMO-001');
 await expect(page.getByLabel('Agent release policy overview')).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await nav.getByRole('link',{name:'Sign in & organization'}).click();
 await expect(page.locator('#identity')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
 const search=nav.getByRole('searchbox',{name:'Find workspace'});
 await search.focus();
 await page.keyboard.type('workflow');
 await expect(nav.getByRole('link',{name:'Workflow Studio',exact:true})).toBeVisible();
 await search.fill('');
 await testInfo.attach('alpha-mobile-identity',{body:await page.screenshot(),contentType:'image/png'});
 await nav.getByRole('button',{name:'Show all workspaces'}).click();
 await expect(overview).toBeVisible();
 await expect(page.locator('#portfolio')).toBeVisible();
 // Phase 4: actual signed browser, not a static mockup. Visual changes
 // remain an unsigned draft; the canonical simulation/approval path is reused.
 await nav.getByRole('link',{name:'Blueprint Studio',exact:true}).click();
 const bp=page.getByRole('region',{name:'R3 Blueprint and Workflow virtual studio'});
 await expect(bp).toBeVisible();
 await bp.getByRole('button',{name:'Start bounded visual blueprint'}).click();
 await bp.getByText('Visual offline workflow builder · controlled nodes and edges',{exact:true}).click();
 await expect(bp.getByRole('img',{name:'Directed offline workflow graph'})).toBeVisible();
 await bp.getByRole('textbox',{name:'New node ID'}).fill('extra-review');
 await bp.getByRole('button',{name:'Add bounded node'}).click();
 expect(JSON.parse(await bp.getByRole('textbox',{name:'Versioned workflow JSON'}).inputValue()).nodes.some((n:{id:string})=>n.id==='extra-review')).toBe(true);
 await bp.getByRole('button',{name:'Remove extra-review',exact:true}).click();
 await bp.getByRole('button',{name:'Simulate blueprint · No execution'}).click();
 await expect(bp.getByRole('status').filter({hasText:'SIMULATED'})).toBeVisible();
 await bp.getByRole('button',{name:'Prepare for signed offline Workflow Studio'}).click();
 const dag=page.getByRole('region',{name:'R3-G governed offline DAG console'});
 await expect(dag.getByRole('status').filter({hasText:'Unsigned draft imported'})).toBeVisible();
 await expect(dag.getByRole('textbox',{name:'Ed25519 signature (base64url)'})).toHaveValue('');
 await expect(dag.getByRole('textbox',{name:'Blueprint ID'})).toHaveValue('offline-science-review');
 await expect(page.locator('#workflow-studio')).toBeFocused();
 await page.getByRole('button',{name:'Account & session'}).click();
 await expect(page.locator('#identity')).toBeFocused();
 await expect(page.getByRole('button',{name:'Sign out'})).toBeVisible();
 test.setTimeout(180000);
 await nav.getByRole('link',{name:'Signed Agent Studio'}).click();
 const team=page.getByRole('region',{name:'Offline team assembly'});
 await team.getByRole('button',{name:'Load team agent catalog'}).click();
 await team.getByRole('textbox',{name:'Team identifier (slug)'}).fill('team-'+randomUUID().slice(0,12));
 for(const [id,role] of [['MKT-PM-001','Portfolio specialist'],['MKT-SCI-001','Evidence specialist']]){
  await team.getByRole('combobox',{name:'Team canonical agent'}).selectOption(id!);
  await team.getByRole('textbox',{name:'Specialist role label'}).fill(role!);
  await team.getByRole('button',{name:'Add specialist'}).click();
 }
 await team.getByRole('button',{name:'Validate offline team draft'}).click();
 await expect(team.getByRole('status')).toContainText('2 members');
 await team.getByRole('button',{name:'Open unsigned team in Workflow Studio'}).click();
 await expect(dag.getByRole('status').filter({hasText:'Unsigned draft imported'})).toBeVisible();
 await expect(dag.getByRole('textbox',{name:'Ed25519 signature (base64url)'})).toHaveValue('');
});
test('T1E-002 independent reviewer uses actual interactive signed OIDC session',async({page})=>{
 await login(page,'reviewer');
 const me=await bff(page,'me');
 expect(me.status).toBe(200);
 expect(me.data.userId).toBe(actor('reviewer'));
 expect(me.data.organizationId).toBe(tenant('reviewer'));
 test.setTimeout(180000);
 await page.getByRole('navigation',{name:'Marketing workspaces'}).getByRole('link',{name:'Provider contract trials'}).click();
 const lab=page.locator('#provider-trials');
 await lab.getByRole('button',{name:'Load trial provider catalog'}).click();
 await lab.getByRole('combobox',{name:'Failure/success scenario'}).selectOption('AUTH_REJECTED');
 await lab.getByRole('button',{name:'Run selected scenario across catalog'}).click();
 await expect(lab.getByRole('status').filter({hasText:'14/14 observed · Matrix evidence recorded'})).toBeVisible({timeout:90000});
 const results=lab.getByRole('table',{name:'Cross-provider rehearsal results'});
 await expect(results.getByRole('row')).toHaveCount(15);
 await expect(results.getByRole('cell',{name:'BLOCKED',exact:true})).toHaveCount(14);
 const history=await bff(page,'integrations/trials/history');
 expect(history.status).toBe(200);
 expect(history.data).toMatchObject({organizationId:tenant('reviewer'),fixtureOnly:true,realAccountsConnected:0,actualProviderRequests:0,externalEffectsAuthorized:false,productionCertified:false});
 expect(history.data.entries.filter((e:any)=>e.scenario==='AUTH_REJECTED'&&e.contractOutcome==='BLOCKED').length).toBeGreaterThanOrEqual(14);
 await page.reload();
 await page.getByRole('button',{name:'Load authenticated workspace'}).click();
 await page.getByRole('navigation',{name:'Marketing workspaces'}).getByRole('link',{name:'Provider contract trials'}).click();
 await lab.getByRole('button',{name:'Refresh stored trial evidence'}).click();
 await expect(lab.getByRole('table',{name:'Stored provider trial evidence'})).toBeVisible();
 await expect(lab.getByRole('table',{name:'Cross-provider rehearsal results'})).toHaveCount(0);
});
test('T1E-003 signed viewer cannot bypass canonical permission checks from browser',async({page})=>{
 await login(page,'viewer');
 // READ_PORTFOLIO is permitted, READ_APPROVALS is not. A forbidden inbox
 // must not prevent the authorized portfolio from loading.
 await expect(page.locator('#portfolio').getByText('active Objectives',{exact:true})).toBeVisible();
 await expect(page.getByText('Approval inbox is not available for your current permissions. Your permitted portfolio remains accessible.')).toBeVisible();
 expect((await bff(page,'approvals/pending')).status).toBe(403);
 expect((await bff(page,'integrations/trials/history')).status).toBe(403);
 expect((await bff(page,'tenancy/offline-subscription')).status).toBe(403);
 expect((await bff(page,'agents/team-preview',{})).status).toBe(403);
 expect((await bff(page,'agents/specialists')).status).toBe(403);
 expect((await bff(page,'agents/specialists',{})).status).toBe(403);
 expect((await bff(page,'agents/specialists/rehearse',{})).status).toBe(403);
 expect((await bff(page,'agents/specialists/execute-rehearsal',{})).status).toBe(403);
 expect((await bff(page,'tenancy/offline-subscription',{})).status).toBe(403);
 expect((await bff(page,'integrations/trials/run',{provider:'OPENAI',scenario:'SUCCESS',requestKey:'viewer-'+randomUUID()})).status).toBe(403);
 await expect(page.locator('#approvals').getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);
 const denied=await bff(page,'assets/offline-raster',{
  brandId,title:'Forged offline creative',
  editableCopy:'Viewer cannot create',pngBase64:'iVBORw0KGgo',
  rightsExpiresAt:new Date(Date.now()+86400000).toISOString(),
  requestKey:randomUUID()
 });
 expect(denied.status).toBe(403);
 expect((await bff(page,'brain/runs/no-fixture-run/cancel',{reason:'Viewer must not cancel runs'})).status).toBe(403);
});
test('T1E-004 actual browser signed org B user cannot read org A brands',async({page})=>{
 await login(page,'foreign');
 const me=await bff(page,'me');
 expect(me.status).toBe(200);
 expect(me.data).toMatchObject({userId:actor('foreign'),
  organizationId:tenant('foreign')});
 const brands=await bff(page,'tenancy/brands');
 expect(brands.status).toBe(200);
 expect(brands.data.some((x:{id:string})=>x.id===brandId)).toBe(false);
 const forbidden=await bff(page,'requests',{
  organizationId:'r3y-tenant-a',requestedOutcome:'Forcibly crossed tenant',
  requestKey:randomUUID()
 });
 expect(forbidden.status).toBe(403);
});
test('T1E-005 real auth-server logout revokes a signed JWT session and stolen cookie',async({page})=>{
 await login(page);
 const previous=(await page.context().cookies(frontend))
  .find(c=>c.name===SESSION_COOKIE);
 expect(previous).toBeDefined();
 await page.getByRole('button',{name:'Sign out'}).click();
 await expect(page.getByText('Signed in as')).toHaveCount(0);
 await page.context().addCookies([previous!]);
 expect((await bff(page,'me')).status).toBe(401);
});
test('T1E-006 provisioned roles cannot impersonate a second tenant even with a signed token',async({request})=>{
 const r=await provisionedSession(request,'admin');
 const response=await request.get(api+'/marketing/me',{
  headers:{authorization:'Bearer '+r.token,
   'x-organization-id':'r3y-tenant-b','x-marketing-session-id':r.sessionId}
 });
 expect(response.status()).toBe(403);
 // Phase 6A uses the two actual signed CI identities, canonical approval
 // commands and real database; no subscription billing or entitlement grant.
 test.setTimeout(180000);
 const reviewer=await provisionedSession(request,'reviewer');
 const invoke=async(who:typeof r,path:string,body?:unknown)=>{
  const headers={authorization:'Bearer '+who.token,'x-organization-id':tenant('admin'),'x-marketing-session-id':who.sessionId};
  const res=body===undefined?await request.get(api+'/marketing/'+path,{headers}):await request.post(api+'/marketing/'+path,{headers,data:body});
  return{status:res.status(),data:await res.json()};
 };
 const path='tenancy/offline-subscription';
 const initial=await invoke(r,path);
 expect(initial).toMatchObject({status:200,data:{revision:0,state:'NONE',simulatedEntitledActions:[],realEntitlementsGranted:false,billingAuthorized:false}});
 const end=new Date(Date.now()+30*86400000).toISOString();
 const command=(action:string,expectedRevision:number,plan='INTERNAL_BASIC',termEndsAt=end)=>({requestKey:'fixture-'+randomUUID(),action,expectedRevision,plan,termEndsAt,fixtureOnly:true});
 const decide=(approvalId:string,who:'admin'|'reviewer')=>({organizationId:tenant('admin'),approvalId,approverUserId:actor(who),commandId:'subscription-'+randomUUID(),correlationId:'subscription-'+randomUUID(),decision:'APPROVED',rationale:'Independent offline subscription lifecycle review'});
 const start=command('START',0);
 const proposed=await invoke(r,path,start);
 expect(proposed).toMatchObject({status:201,data:{decision:'PENDING',revision:1,realEntitlementsGranted:false}});
 expect(await invoke(r,path,start)).toMatchObject({status:201,data:{approvalId:proposed.data.approvalId,replayed:true}});
 expect((await invoke(r,path,{...start,plan:'INTERNAL_TEAM'})).status).toBe(409);
 expect((await invoke(r,'approvals/decide',decide(proposed.data.approvalId,'admin'))).status).toBe(403);
 const competing=await invoke(r,path,command('START',0,'INTERNAL_TEAM'));
 expect(competing.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(proposed.data.approvalId,'reviewer'))).status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(competing.data.approvalId,'reviewer'))).status).toBe(409);
 expect(await invoke(r,path)).toMatchObject({status:200,data:{state:'ACTIVE',revision:1,simulatedEntitledActions:['RESEARCH_READ','CREATIVE_DRAFT'],externalEffectsAuthorized:false}});
 const transition=async(action:string,rev:number,plan:string,term:string,state:string)=>{
  const draft=await invoke(r,path,command(action,rev,plan,term));
  expect(draft.status,JSON.stringify(draft.data)).toBe(201);
  const approved=await invoke(reviewer,'approvals/decide',decide(draft.data.approvalId,'reviewer'));
  expect(approved.status,JSON.stringify(approved.data)).toBe(201);
  const current=await invoke(r,path);
  expect(current).toMatchObject({status:200,data:{state,revision:rev+1,realEntitlementsGranted:false,billingAuthorized:false,productionCertified:false}});
  return current.data;
 };
 expect((await transition('CHANGE',1,'INTERNAL_TEAM',end,'ACTIVE')).simulatedEntitledActions).toContain('CAMPAIGN_WRITE');
 expect((await transition('SUSPEND',2,'INTERNAL_TEAM',end,'SUSPENDED')).simulatedEntitledActions).toEqual([]);
 await transition('RESUME',3,'INTERNAL_TEAM',end,'ACTIVE');
 const renewed=new Date(Date.now()+60*86400000).toISOString();
 await transition('RENEW',4,'INTERNAL_TEAM',renewed,'ACTIVE');
 expect((await transition('CANCEL',5,'INTERNAL_TEAM',renewed,'CANCELLED')).simulatedEntitledActions).toEqual([]);
 expect((await invoke(r,path,command('START',6))).status).toBe(409);
 // Persistent specialist registration uses the canonical approval ledger,
 // but must not create executable capability or enter the canonical roster.
 const specialistPath='agents/specialists';
 const slug='evidence-'+randomUUID().slice(0,12);
 const definition={requestKey:'fixture-'+randomUUID(),slug,name:'Synthetic evidence specialist',mission:'Prepare bounded internal evidence review drafts only',templateAgentId:'MKT-SCI-001',fixtureOnly:true};
 const specialist=await invoke(r,specialistPath,definition);
 expect(specialist).toMatchObject({status:201,data:{decision:'PENDING',agentId:'MKT-SPECIALIST-'+slug,executionAuthorized:false}});
 expect(await invoke(r,specialistPath,definition)).toMatchObject({status:201,data:{approvalId:specialist.data.approvalId,replayed:true}});
 expect((await invoke(r,specialistPath,{...definition,name:'Different specialist'})).status).toBe(409);
 expect((await invoke(r,specialistPath,{...definition,toolKeys:['MCP']})).status).toBe(400);
 expect((await invoke(r,'approvals/decide',decide(specialist.data.approvalId,'admin'))).status).toBe(403);
 expect((await invoke(r,specialistPath)).data.records).toEqual([]);
 expect((await invoke(reviewer,'approvals/decide',decide(specialist.data.approvalId,'reviewer'))).status).toBe(201);
 const specialistRead=await invoke(r,specialistPath);
 expect(specialistRead.data.records).toEqual([expect.objectContaining({agentId:specialist.data.agentId,status:'PAUSED',installedVersion:1,executionAuthorized:false,memoryWritesAuthorized:false})]);
 expect((await invoke(r,'agents')).data.some((x:any)=>x.id===specialist.data.agentId)).toBe(false);
 expect((await invoke(r,'agents/team-preview',{blueprintId:'team-invalid-custom',version:1,members:[{agentId:specialist.data.agentId,expectedVersion:1,roleLabel:'Custom specialist'}],fixtureOnly:true})).status).toBe(400);
 expect((await invoke(r,specialistPath,{...definition,requestKey:'fixture-'+randomUUID()})).status).toBe(409);
 const task={requestKey:'fixture-'+randomUUID(),agentId:specialist.data.agentId,objective:'Assess synthetic scientific evidence for internal review',market:'Synthetic Egypt research segment',fixtureOnly:true};
 const taskPath=specialistPath+'/rehearse',executePath=specialistPath+'/execute-rehearsal';
 const proposedTask=await invoke(r,taskPath,task);
 expect(proposedTask).toMatchObject({status:201,data:{decision:'PENDING',registrationId:specialist.data.approvalId,templateId:'MKT-SCI-001',autonomousExecutionAuthorized:false,externalEffectsAuthorized:false}});
 expect(await invoke(r,taskPath,task)).toMatchObject({status:201,data:{approvalId:proposedTask.data.approvalId,replayed:true}});
 expect((await invoke(r,taskPath,{...task,objective:'Different synthetic objective for review'})).status).toBe(409);
 expect((await invoke(r,taskPath,{...task,tools:['MCP']})).status).toBe(400);
 const executeCommand={approvalId:proposedTask.data.approvalId,fixtureOnly:true};
 expect((await invoke(r,executePath,executeCommand)).status).toBe(409);
 expect((await invoke(r,'approvals/decide',decide(proposedTask.data.approvalId,'admin'))).status).toBe(403);
 expect((await invoke(reviewer,'approvals/decide',decide(proposedTask.data.approvalId,'reviewer'))).status).toBe(201);
 expect((await invoke(reviewer,executePath,executeCommand)).status).toBe(403);
 const execution=await invoke(r,executePath,executeCommand);
 expect(execution.status,JSON.stringify(execution.data)).toBe(201);
 expect(execution.data).toMatchObject({status:'COMPLETED',replayed:false,externalEffectsAuthorized:false,decision:{agentId:specialist.data.agentId,templateAgentId:'MKT-SCI-001',templateDigest:proposedTask.data.templateDigest,approvalId:proposedTask.data.approvalId,outputHumanApproved:false,modelCallsAuthorized:false,toolCallsAuthorized:false,memoryWritesAuthorized:false,templateDecision:{agentId:'MKT-SCI-001',action:'CHECK_EVIDENCE',payload:{evidence:{verified:false},controls:{externalEffectPermitted:false}}}}});
 const persisted=await invoke(r,'agents/executions/'+execution.data.executionId);
 expect(persisted).toMatchObject({status:200,data:{agentId:specialist.data.agentId,correlationId:proposedTask.data.approvalId,status:'COMPLETED',decision:execution.data.decision}});
 expect(await invoke(r,executePath,executeCommand)).toMatchObject({status:201,data:{executionId:execution.data.executionId,replayed:true}});
 expect((await invoke(r,specialistPath)).data.records[0]).toMatchObject({agentId:specialist.data.agentId,status:'PAUSED',executionAuthorized:false});
 // Specialist evidence is exclusive: neither template nor a different
 // tenant may inherit it. Sources and memory reuse Knowledge Fabric owners.
 const specialistId=specialist.data.agentId;
 const marker='specialist'+randomUUID().replaceAll('-','').slice(0,16);
 const source={sourceKey:'specialist-fixture-'+randomUUID(),title:'Synthetic specialist reference',text:marker+' is a synthetic assay review reference for controlled internal fixture evaluation only.',accessMode:'AGENT_SCOPED',agentScope:[specialistId],expiresAt:new Date(Date.now()+14*86400000).toISOString()};
 expect((await invoke(r,'learning/knowledge',{...source,agentScope:[specialistId,'MKT-SCI-001']})).status).toBe(403);
 expect((await invoke(r,'learning/knowledge',{...source,expiresAt:undefined})).status).toBe(403);
 expect((await invoke(r,'learning/knowledge',{...source,agentScope:['MKT-SPECIALIST-unregistered-fixture']})).status).toBe(403);
 const doc=await invoke(r,'learning/knowledge',source);
 expect(doc).toMatchObject({status:201,data:{status:'QUARANTINED',agentScope:[specialistId]}});
 const contextPath='learning/knowledge/agent-context-preview';
 const context=(who:typeof r,agentId=specialistId)=>invoke(who,contextPath,{agentId,query:marker});
 expect((await context(r)).data.results).toEqual([]);
 const reviewPath='learning/knowledge/'+doc.data.id+'/review';
 const reason='Independent review of exclusive synthetic specialist fixture';
 expect((await invoke(r,reviewPath,{decision:'REVIEW',reason})).status).toBe(403);
 expect((await invoke(reviewer,reviewPath,{decision:'REVIEW',reason})).status).toBe(201);
 const inspected=await context(r);
 expect(inspected).toMatchObject({status:201,data:{agentId:specialistId,results:[expect.objectContaining({documentId:doc.data.id,independentlyVerified:false})],memories:[],realModelInvocations:0,autonomousMemoryWrites:0,skillPromotions:0,externalEffectsAuthorized:false}});
 expect((await context(r,'MKT-SCI-001')).data.results).toEqual([]);
 expect((await invoke(r,'learning/knowledge/'+doc.data.id+'/promote',{topic:'Synthetic specialist evaluation',sector:'Research'})).status).toBe(403);
 const memory={documentId:doc.data.id,agentId:specialistId,memoryKey:'memory-'+randomUUID(),content:'This synthetic review fixture is intended for specialist evidence assessment only.',expiresAt:new Date(Date.now()+7*86400000).toISOString()};
 expect((await invoke(r,'learning/memories',{...memory,agentId:'MKT-SCI-001'})).status).toBe(409);
 expect((await invoke(r,'learning/memories',{...memory,expiresAt:new Date(Date.now()+20*86400000).toISOString()})).status).toBe(409);
 const proposedMemory=await invoke(r,'learning/memories',memory);
 expect(proposedMemory).toMatchObject({status:201,data:{status:'PROPOSED',autoActivated:false}});
 expect((await context(r)).data.memories).toEqual([]);
 const memoryReview='learning/memories/'+proposedMemory.data.memoryId+'/review';
 expect((await invoke(r,memoryReview,{decision:'APPROVE',reason})).status).toBe(403);
 expect((await invoke(reviewer,memoryReview,{decision:'APPROVE',reason})).status).toBe(201);
 expect((await context(r)).data.memories).toEqual([expect.objectContaining({memoryId:proposedMemory.data.memoryId,humanReviewed:true,independentlyVerified:false})]);
 expect((await context(r,'MKT-SCI-001')).data.memories.some((m:any)=>m.memoryId===proposedMemory.data.memoryId)).toBe(false);
 const feedback=await invoke(r,'learning/knowledge/feedback',{agentId:specialistId,query:marker,chunkId:inspected.data.results[0].chunkId,label:'RELEVANT',reason});
 expect(feedback).toMatchObject({status:201,data:{specialistAgentId:specialistId,automaticRankingChange:false,automaticSkillRelease:false}});
 const cases=[{id:'specialist-fixture',query:marker,relevantDocumentIds:[doc.data.id]}];
 const evaluation=await invoke(r,'learning/knowledge/evaluate',{agentId:specialistId,k:1,cases});
 expect(evaluation).toMatchObject({status:201,data:{specialistAgentId:specialistId,recallAtK:1,automaticSkillRelease:false}});
 // Versioned configuration supersedes unexecuted legacy tasks without changing historical receipts.
 const legacyApproved=await invoke(r,taskPath,{...task,requestKey:'fixture-'+randomUUID()});
 expect(legacyApproved.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(legacyApproved.data.approvalId,'reviewer'))).status).toBe(201);
 const config={action:'CONFIGURE',agentId:specialistId,requestKey:'fixture-'+randomUUID(),mission:'Review synthetic scientific evidence and document research limitations',expectedVersion:0,evidenceRequired:true,maxObjectiveChars:100,reviewSkills:['EVIDENCE_GAPS','CLAIM_LIMITATIONS'],fixtureOnly:true};
 const linkedConfig={...config,learningEvaluationId:evaluation.data.evaluationId};
 expect((await invoke(r,specialistPath,{...linkedConfig,requestKey:'fixture-'+randomUUID(),learningEvaluationId:randomUUID()})).status).toBe(409);
 expect((await invoke(r,specialistPath,{...linkedConfig,requestKey:'fixture-'+randomUUID(),reviewSkills:['EVIDENCE_GAPS']})).status).toBe(409);
 const cfg=await invoke(r,specialistPath,linkedConfig);
 expect(cfg.data.learningEvidence).toMatchObject({evaluationId:evaluation.data.evaluationId,recallAtK:1,precisionAtK:1,recommendedSkill:'CLAIM_LIMITATIONS',independentlyVerified:false,automaticPromotion:false});
 expect(cfg).toMatchObject({status:201,data:{decision:'PENDING',version:1,executionAuthorized:false,skillEvaluation:{passed:true,modelQualityEvaluated:false,scientificVerification:false,capabilityExpansionAuthorized:false,results:expect.arrayContaining([expect.objectContaining({id:'DUPLICATE_REFERENCE_DENIAL',passed:true})])}}});
 expect(await invoke(r,specialistPath,linkedConfig)).toMatchObject({status:201,data:{approvalId:cfg.data.approvalId,replayed:true}});
 expect((await invoke(r,'approvals/decide',decide(cfg.data.approvalId,'admin'))).status).toBe(403);
 expect((await invoke(reviewer,'approvals/pending')).data).toContainEqual(expect.objectContaining({id:cfg.data.approvalId,specialistConfiguration:expect.objectContaining({version:1,mission:config.mission,evidenceRequired:true,reviewSkills:['CLAIM_LIMITATIONS','EVIDENCE_GAPS'],learningEvidence:expect.objectContaining({evaluationId:evaluation.data.evaluationId,recommendedSkill:'CLAIM_LIMITATIONS',automaticPromotion:false}),skillEvaluation:expect.objectContaining({passed:true})})}));
 expect((await invoke(reviewer,'approvals/decide',decide(cfg.data.approvalId,'reviewer'))).status).toBe(201);
 expect((await invoke(r,specialistPath)).data.records[0]).toMatchObject({configuration:{version:1,mission:config.mission,evidenceRequired:true}});
 expect((await invoke(r,specialistPath,{...config,requestKey:'fixture-'+randomUUID()})).status).toBe(409);
 expect((await invoke(r,taskPath,{...task,requestKey:'fixture-'+randomUUID()})).status).toBe(409);
 expect((await invoke(r,taskPath,{...task,requestKey:'fixture-'+randomUUID(),contextQuery:marker,objective:'x'.repeat(101)})).status).toBe(409);
 expect((await invoke(r,taskPath,{...task,requestKey:'fixture-'+randomUUID(),contextQuery:marker})).status).toBe(409);
 expect((await invoke(r,executePath,{approvalId:legacyApproved.data.approvalId,fixtureOnly:true})).status).toBe(409);
 expect((await invoke(r,executePath,executeCommand)).data.replayed).toBe(true);
 // Context-bound execution pins only reviewed citation metadata, not raw source or memory text.
 const contextualTask={...task,requestKey:'fixture-'+randomUUID(),contextQuery:marker,brainMode:'MISSION_PLAN_V1'};
 const contextual=await invoke(r,taskPath,contextualTask);
 expect(contextual).toMatchObject({status:201,data:{contextPin:{query:marker,references:expect.arrayContaining([expect.objectContaining({kind:'SOURCE',documentId:doc.data.id}),expect.objectContaining({kind:'MEMORY',recordId:proposedMemory.data.memoryId})])}}});
 const pending=await invoke(reviewer,'approvals/pending');
 expect(pending.data).toContainEqual(expect.objectContaining({id:contextual.data.approvalId,specialistReview:expect.objectContaining({contextPin:contextual.data.contextPin,brainMode:'MISSION_PLAN_V1'})}));
 expect((await invoke(reviewer,'approvals/decide',decide(contextual.data.approvalId,'reviewer'))).status).toBe(201);
 const contextualCommand={approvalId:contextual.data.approvalId,fixtureOnly:true};
 const contextualResult=await invoke(r,executePath,contextualCommand);
 expect(contextualResult).toMatchObject({status:201,data:{status:'COMPLETED',decision:{contextEvidence:{pin:contextual.data.contextPin,independentlyVerified:false,sourceTextCopied:false},templateDecision:{payload:{evidence:{references:contextual.data.contextPin.references.map((x:any)=>x.citationRef),verified:false}}}}}});
 expect(contextualResult.data.decision).toMatchObject({configuration:{version:1,mission:config.mission,evidenceRequired:true},missionPlan:{mode:'MISSION_PLAN_V1',mission:config.mission,objective:task.objective,reviewSkills:['CLAIM_LIMITATIONS','EVIDENCE_GAPS'],tasks:expect.arrayContaining([expect.objectContaining({kind:'CLAIM_LIMITATIONS'}),expect.objectContaining({kind:'EVIDENCE_GAPS'})]),evidenceStatus:'REFERENCES_ONLY_UNVERIFIED',humanReviewRequired:true,scientificVerification:false,externalEffectsAuthorized:false},missionPlanDigest:expect.stringMatching(/^sha256:[0-9a-f]{64}$/)});
 // Explicit decision mode must produce a bounded specialist disposition, not just a template draft.
 const decisionTask={...contextualTask,requestKey:'fixture-'+randomUUID(),brainMode:'SPECIALIST_DECISION_V1'};
 const decisionApproval=await invoke(r,taskPath,decisionTask);
 expect(decisionApproval).toMatchObject({status:201,data:{decision:'PENDING',input:{brainMode:'SPECIALIST_DECISION_V1'}}});
 expect((await invoke(reviewer,'approvals/decide',decide(decisionApproval.data.approvalId,'reviewer'))).status).toBe(201);
 const decisionCommand={approvalId:decisionApproval.data.approvalId,fixtureOnly:true};
 const decisionResult=await invoke(r,executePath,decisionCommand);
 expect(decisionResult).toMatchObject({status:201,data:{status:'COMPLETED',decision:{specialistDecision:{mode:'SPECIALIST_DECISION_V1',disposition:'DRAFT_FOR_REVIEW',draftEligible:true,semanticAlignmentVerified:false,scientificVerification:false,humanReviewRequired:true,externalEffectsAuthorized:false},specialistDecisionDigest:expect.stringMatching(/^sha256:[0-9a-f]{64}$/)}}});
 expect((await invoke(r,executePath,decisionCommand)).data.replayed).toBe(true);
 const contractTask={...decisionTask,requestKey:'fixture-'+randomUUID(),simulationMode:'PROVIDER_CONTRACT_V1'};
 const contractApproval=await invoke(r,taskPath,contractTask);
 expect(contractApproval).toMatchObject({status:201,data:{decision:'PENDING',input:{simulationMode:'PROVIDER_CONTRACT_V1'}}});
 expect((await invoke(reviewer,'approvals/pending')).data).toContainEqual(expect.objectContaining({id:contractApproval.data.approvalId,specialistReview:expect.objectContaining({simulationMode:'PROVIDER_CONTRACT_V1'})}));
 expect((await invoke(reviewer,'approvals/decide',decide(contractApproval.data.approvalId,'reviewer'))).status).toBe(201);
 const contractCommand={approvalId:contractApproval.data.approvalId,fixtureOnly:true};
 const contractResult=await invoke(r,executePath,contractCommand);
 expect(contractResult).toMatchObject({status:201,data:{status:'COMPLETED',decision:{providerContracts:{schema:'medsol.specialist-provider-contracts.v1',decisionDigest:expect.stringMatching(/^sha256:/),providerRequestsMade:0,realModelInvocations:0,actualCostMicros:0,modelQualityEvaluated:false,externalEffectsAuthorized:false,results:['OPENAI','ANTHROPIC','GEMINI','LOCAL'].map(providerKey=>expect.objectContaining({providerKey,model:'synthetic:'+providerKey.toLowerCase(),passed:true,actualCostMicros:0}))},providerContractsDigest:expect.stringMatching(/^sha256:/)}}});
 expect((await invoke(r,executePath,contractCommand)).data.replayed).toBe(true);
 const unrelated=await invoke(r,taskPath,{...decisionTask,requestKey:'fixture-'+randomUUID(),objective:'Compose unrelated advertisements',simulationMode:'PROVIDER_CONTRACT_V1'});
 expect(unrelated.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(unrelated.data.approvalId,'reviewer'))).status).toBe(201);
 const unrelatedResult=await invoke(r,executePath,{approvalId:unrelated.data.approvalId,fixtureOnly:true});
 expect(unrelatedResult).toMatchObject({status:201,data:{status:'BLOCKED',decision:{specialistDecision:{disposition:'ESCALATE_SCOPE',draftEligible:false}}}});
 expect(unrelatedResult.data.decision).not.toHaveProperty('providerContracts');
 // Separate reviewed specialist receives provenance only; it retrieves its own evidence.
 const target=await invoke(r,specialistPath,{...definition,requestKey:'fixture-'+randomUUID(),slug:'zzz-handover-'+randomUUID().slice(0,12),name:'Synthetic handover specialist'});
 expect(target.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(target.data.approvalId,'reviewer'))).status).toBe(201);
 const targetId=target.data.agentId;
 expect((await context(r,targetId)).data.results).toEqual([]);
 const targetSource=await invoke(r,'learning/knowledge',{...source,sourceKey:'specialist-fixture-'+randomUUID(),agentScope:[targetId],text:marker+' independent synthetic target evidence for internal handover review.'});
 expect(targetSource.status).toBe(201);
 expect((await invoke(reviewer,'learning/knowledge/'+targetSource.data.id+'/review',{decision:'REVIEW',reason})).status).toBe(201);
 const handoverTask={...decisionTask,requestKey:'fixture-'+randomUUID(),agentId:targetId,handoverApprovalId:decisionApproval.data.approvalId};
 expect((await invoke(r,taskPath,{...handoverTask,agentId:specialistId,requestKey:'fixture-'+randomUUID()})).status).toBe(409);
 expect((await invoke(r,taskPath,{...handoverTask,requestKey:'fixture-'+randomUUID(),handoverApprovalId:unrelated.data.approvalId})).status).toBe(409);
 const handover=await invoke(r,taskPath,handoverTask);
 expect(handover).toMatchObject({status:201,data:{handover:{sourceAgentId:specialistId,approvalId:decisionApproval.data.approvalId,sourceEvidenceTransferred:false,externalEffectsAuthorized:false},contextPin:{references:[expect.objectContaining({documentId:targetSource.data.id})]}}});
 expect(JSON.stringify(handover.data)).not.toContain(doc.data.id);
 expect((await invoke(reviewer,'approvals/pending')).data).toContainEqual(expect.objectContaining({id:handover.data.approvalId,specialistReview:expect.objectContaining({handover:handover.data.handover})}));
 expect((await invoke(r,'approvals/decide',decide(handover.data.approvalId,'admin'))).status).toBe(403);
 expect((await invoke(reviewer,'approvals/decide',decide(handover.data.approvalId,'reviewer'))).status).toBe(201);
 const handoverCommand={approvalId:handover.data.approvalId,fixtureOnly:true};
 const handoverResult=await invoke(r,executePath,handoverCommand);
 expect(handoverResult).toMatchObject({status:201,data:{status:'COMPLETED',decision:{handover:handover.data.handover,specialistDecision:{disposition:'DRAFT_FOR_REVIEW'}}}});
 expect(JSON.stringify(handoverResult.data)).not.toContain(doc.data.id);
 expect((await invoke(r,executePath,handoverCommand)).data.replayed).toBe(true);
 // A third specialist completes the reviewed chain with its own exclusive evidence.
 const third=await invoke(r,specialistPath,{...definition,requestKey:'fixture-'+randomUUID(),slug:'zzzz-chain-'+randomUUID().slice(0,12),name:'Synthetic chain specialist'});
 expect(third.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(third.data.approvalId,'reviewer'))).status).toBe(201);
 const thirdId=third.data.agentId;
 const thirdSource=await invoke(r,'learning/knowledge',{...source,sourceKey:'specialist-fixture-'+randomUUID(),agentScope:[thirdId],text:marker+' independent synthetic third stage evidence for internal review.'});
 expect(thirdSource.status).toBe(201);
 expect((await invoke(reviewer,'learning/knowledge/'+thirdSource.data.id+'/review',{decision:'REVIEW',reason})).status).toBe(201);
 const chainTask={...handoverTask,requestKey:'fixture-'+randomUUID(),agentId:thirdId,handoverApprovalId:handover.data.approvalId};
 const chain=await invoke(r,taskPath,chainTask);
 expect(chain).toMatchObject({status:201,data:{handover:{ancestorAgentIds:[specialistId,targetId],sourceAgentId:targetId,sourceEvidenceTransferred:false},contextPin:{references:[expect.objectContaining({documentId:thirdSource.data.id})]}}});
 expect(JSON.stringify(chain.data)).not.toContain(doc.data.id);
 expect(JSON.stringify(chain.data)).not.toContain(targetSource.data.id);
 expect((await invoke(r,taskPath,{...chainTask,requestKey:'fixture-'+randomUUID(),agentId:specialistId})).status).toBe(409);
 expect((await invoke(reviewer,'approvals/decide',decide(chain.data.approvalId,'reviewer'))).status).toBe(201);
 const chainCommand={approvalId:chain.data.approvalId,fixtureOnly:true};
 expect(await invoke(r,executePath,chainCommand)).toMatchObject({status:201,data:{status:'COMPLETED',decision:{handover:chain.data.handover,specialistDecision:{disposition:'DRAFT_FOR_REVIEW'}}}});
 const staleChain=await invoke(r,taskPath,{...chainTask,requestKey:'fixture-'+randomUUID()});
 expect(staleChain.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(staleChain.data.approvalId,'reviewer'))).status).toBe(201);
 // Batch dispatch reuses the exact approved executions, including history.
 const batchPath=specialistPath+'/execute-batch';
 const batch={approvalIds:[decisionApproval.data.approvalId,handover.data.approvalId,staleChain.data.approvalId],fixtureOnly:true};
 expect((await invoke(reviewer,batchPath,batch)).status).toBe(409);
 expect((await invoke(r,batchPath,{...batch,approvalIds:[decisionApproval.data.approvalId,decisionApproval.data.approvalId]})).status).toBe(400);
 expect((await invoke(r,batchPath,{...batch,approvalIds:[decisionApproval.data.approvalId,contractApproval.data.approvalId]})).status).toBe(409);
 expect(await invoke(r,batchPath,batch)).toMatchObject({status:201,data:{status:'COMPLETED',atomic:false,automaticRetry:false,externalEffectsAuthorized:false,items:[{approvalId:decisionApproval.data.approvalId,status:'COMPLETED',replayed:true},{approvalId:handover.data.approvalId,status:'COMPLETED',replayed:true},{approvalId:staleChain.data.approvalId,status:'COMPLETED',replayed:false}]}});
 expect((await invoke(r,batchPath,batch)).data.items.every((x:any)=>x.replayed===true)).toBe(true);
 const haltBatch=await invoke(r,batchPath,{...batch,approvalIds:[unrelated.data.approvalId,handover.data.approvalId]});
 expect(haltBatch).toMatchObject({status:201,data:{status:'HALTED',items:[{status:'BLOCKED',replayed:true},{status:'NOT_DISPATCHED'}]}});
 const freshStaleChain=await invoke(r,taskPath,{...chainTask,requestKey:'fixture-'+randomUUID()});
 expect(freshStaleChain.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(freshStaleChain.data.approvalId,'reviewer'))).status).toBe(201);
 const pendingHandover=await invoke(r,taskPath,{...handoverTask,requestKey:'fixture-'+randomUUID()});
 expect(pendingHandover.status).toBe(201);
 const approvedHandover=await invoke(r,taskPath,{...handoverTask,requestKey:'fixture-'+randomUUID()});
 expect(approvedHandover.status).toBe(201);
 expect((await invoke(r,batchPath,{approvalIds:[decisionApproval.data.approvalId,pendingHandover.data.approvalId],fixtureOnly:true})).status).toBe(409);
 expect((await invoke(reviewer,'approvals/decide',decide(approvedHandover.data.approvalId,'reviewer'))).status).toBe(201);
 expect(JSON.stringify(contextualResult.data)).not.toContain(source.text);
 expect(JSON.stringify(contextualResult.data)).not.toContain(memory.content);
 expect((await invoke(r,executePath,contextualCommand)).data.replayed).toBe(true);
 const stale=await invoke(r,taskPath,{...contextualTask,requestKey:'fixture-'+randomUUID()});
 const stalePending=await invoke(r,taskPath,{...contextualTask,requestKey:'fixture-'+randomUUID()});
 expect(stale.status).toBe(201);expect(stalePending.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(stale.data.approvalId,'reviewer'))).status).toBe(201);
 const revoked=await invoke(reviewer,'learning/knowledge/'+doc.data.id+'/revoke',{reason:'Withdraw exclusive specialist synthetic evidence after evaluation'});
 expect(revoked).toMatchObject({status:201,data:{status:'REVOKED',scrubbedMemories:1}});
 expect((await context(r)).data).toMatchObject({results:[],memories:[]});
 expect((await invoke(reviewer,'approvals/decide',decide(pendingHandover.data.approvalId,'reviewer'))).status).toBe(409);
 expect((await invoke(r,executePath,{approvalId:approvedHandover.data.approvalId,fixtureOnly:true})).status).toBe(409);
 expect((await invoke(r,executePath,handoverCommand)).data.replayed).toBe(true);
 expect((await invoke(r,executePath,{approvalId:freshStaleChain.data.approvalId,fixtureOnly:true})).status).toBe(409);
 expect(await invoke(r,batchPath,{approvalIds:[freshStaleChain.data.approvalId,decisionApproval.data.approvalId],fixtureOnly:true})).toMatchObject({status:201,data:{status:'HALTED',items:[{status:'ERROR'},{status:'NOT_DISPATCHED'}]}});
 expect((await invoke(r,executePath,chainCommand)).data.replayed).toBe(true);
 expect((await invoke(r,executePath,{approvalId:stale.data.approvalId,fixtureOnly:true})).status).toBe(409);
 expect((await invoke(reviewer,'approvals/decide',decide(stalePending.data.approvalId,'reviewer'))).status).toBe(409);
 expect((await invoke(r,taskPath,{...contextualTask,requestKey:'fixture-'+randomUUID()})).status).toBe(409);
 expect((await invoke(r,executePath,contextualCommand)).data.replayed).toBe(true);
 expect((await invoke(r,'learning/knowledge/evaluate',{agentId:specialistId,k:1,cases})).status).toBe(409);
 const config2=await invoke(r,specialistPath,{...config,requestKey:'fixture-'+randomUUID(),expectedVersion:1,evidenceRequired:false,reviewSkills:[]});
 expect(config2).toMatchObject({status:201,data:{version:2,previousDigest:expect.stringMatching(/^sha256:/)}});
 expect((await invoke(reviewer,'approvals/decide',decide(config2.data.approvalId,'reviewer'))).status).toBe(201);
 expect((await invoke(r,specialistPath)).data.records[0]).toMatchObject({configuration:{version:2,evidenceRequired:false}});
 expect((await invoke(r,executePath,contextualCommand)).data.replayed).toBe(true);
 const noEvidence=await invoke(r,taskPath,{...task,requestKey:'fixture-'+randomUUID(),brainMode:'SPECIALIST_DECISION_V1'});
 expect(noEvidence.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(noEvidence.data.approvalId,'reviewer'))).status).toBe(201);
 expect(await invoke(r,executePath,{approvalId:noEvidence.data.approvalId,fixtureOnly:true})).toMatchObject({status:201,data:{status:'BLOCKED',decision:{specialistDecision:{disposition:'REQUEST_EVIDENCE',draftEligible:false}}}});
 // Retirement must fence even previously approved but unexecuted context-free tasks.
 const beforeRetirement=await invoke(r,taskPath,{...task,requestKey:'fixture-'+randomUUID()});
 expect(beforeRetirement.status).toBe(201);
 expect((await invoke(reviewer,'approvals/decide',decide(beforeRetirement.data.approvalId,'reviewer'))).status).toBe(201);
 const retirement={action:'RETIRE',agentId:specialistId,requestKey:'fixture-'+randomUUID(),reason:'Retire synthetic specialist after completed rehearsal',fixtureOnly:true};
 const retire=await invoke(r,specialistPath,retirement);
 expect(retire).toMatchObject({status:201,data:{decision:'PENDING',targetStatus:'RETIRED',executionAuthorized:false}});
 expect(await invoke(r,specialistPath,retirement)).toMatchObject({status:201,data:{approvalId:retire.data.approvalId,replayed:true}});
 expect((await invoke(r,specialistPath,{...retirement,reason:'Different synthetic reason for retirement'})).status).toBe(409);
 expect((await invoke(r,'approvals/decide',decide(retire.data.approvalId,'admin'))).status).toBe(403);
 expect((await invoke(r,specialistPath)).data.records[0].status).toBe('PAUSED');
 expect((await invoke(reviewer,'approvals/pending')).data).toContainEqual(expect.objectContaining({id:retire.data.approvalId,specialistRetirement:expect.objectContaining({agentId:specialistId,targetStatus:'RETIRED',reason:retirement.reason})}));
 expect((await invoke(reviewer,'approvals/decide',decide(retire.data.approvalId,'reviewer'))).status).toBe(201);
 expect((await invoke(r,specialistPath)).data.records[0]).toMatchObject({agentId:specialistId,status:'RETIRED',retirementApprovalId:retire.data.approvalId,executionAuthorized:false});
 expect((await invoke(r,taskPath,{...task,requestKey:'fixture-'+randomUUID()})).status).toBe(409);
 expect((await invoke(r,executePath,{approvalId:beforeRetirement.data.approvalId,fixtureOnly:true})).status).toBe(409);
 expect((await context(r)).status).toBe(403);
 expect((await invoke(r,executePath,executeCommand)).data.replayed).toBe(true);
 const foreign=await provisionedSession(request,'foreign');
 const foreignContext=await request.post(api+'/marketing/'+contextPath,{headers:{authorization:'Bearer '+foreign.token,'x-organization-id':tenant('foreign'),'x-marketing-session-id':foreign.sessionId},data:{agentId:specialistId,query:marker}});
 expect(foreignContext.status()).toBe(403);
 const foreignExecution=await request.get(api+'/marketing/agents/executions/'+execution.data.executionId,{headers:{authorization:'Bearer '+foreign.token,'x-organization-id':tenant('foreign'),'x-marketing-session-id':foreign.sessionId}});
 expect(foreignExecution.status()).toBe(404);
 const foreignSpecialists=await request.get(api+'/marketing/'+specialistPath,{headers:{authorization:'Bearer '+foreign.token,'x-organization-id':tenant('foreign'),'x-marketing-session-id':foreign.sessionId}});
 expect(foreignSpecialists.status()).toBe(200);
 expect(await foreignSpecialists.json()).toMatchObject({organizationId:tenant('foreign'),records:[],reviews:[]});
 const foreignRead=await request.get(api+'/marketing/'+path,{headers:{authorization:'Bearer '+foreign.token,'x-organization-id':tenant('foreign'),'x-marketing-session-id':foreign.sessionId}});
 expect(foreignRead.status()).toBe(200);
 expect(await foreignRead.json()).toMatchObject({organizationId:tenant('foreign'),revision:0,reviews:[]});
});
test('T1E-007 signed staging operator drives real offline campaign workflow, no real providers',async({page})=>{
 await login(page);
 await page.locator('summary').filter({hasText:'Integrated Campaign Journey'}).click();
 const slug='alpha-brand-'+randomUUID().slice(0,8);
 const name='Alpha synthetic brand '+slug;
 const form=page.getByRole('group',{name:'Register a tenant brand'});
 await form.getByRole('textbox',{name:'New brand name'}).fill(name);
 await form.getByRole('textbox',{name:'New brand slug'}).fill(slug);
 await form.getByRole('button',{name:'Register tenant brand'}).click();
 await expect(page.getByRole('status').filter({hasText:'Tenant brand registered and read back'})).toBeVisible();
 const registered=await bff(page,'tenancy/brands');
 expect(registered.status).toBe(200);
 const createdBrand=registered.data.find((x:any)=>x.slug===slug);
 expect(createdBrand).toMatchObject({name,status:'ACTIVE'});
 await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption(createdBrand.id);
 await page.getByRole('textbox',{name:'Marketing objective (name)'})
  .fill('T1E operator scientific campaign '+randomUUID().slice(0,8));
 await page.getByRole('button',{name:'Create objective',exact:true}).first().click();
 await expect(page.getByRole('status').filter({hasText:'Objective created in canonical catalogue'}))
  .toBeVisible();
 await page.getByRole('button',{name:/Run offline agent assessment/}).click();
 await expect(page.getByRole('status').filter({hasText:'Agent workflow created campaign'}))
  .toBeVisible();
 const campaignId=await page.getByRole('textbox',{name:'Tenant campaign ID'}).inputValue();
 const journey=await bff(page,'journeys/'+campaignId);
 expect(journey.status).toBe(200);
 expect(journey.data).toMatchObject({campaign:{id:campaignId,brandId:createdBrand.id},
  workflow:{status:'WAITING_APPROVAL'}});
 const budget=await bff(page,'agents/budget');
 expect(budget.status).toBe(200);
 expect(budget.data.enabled).toBe(false);
 const queued=await bff(page,'brain/runs',{commandKey:'alpha-cancel-'+randomUUID(),requestedOutcome:'Obsolete internal rehearsal; cancel before dispatch'});
 expect(queued.status).toBe(201);
 const runId=queued.data.id;
 const brain=page.locator('#agent-brain');
 await brain.getByRole('button',{name:'Load persisted brain runs'}).click();
 await brain.getByRole('combobox',{name:'Select brain run'}).selectOption(runId);
 await brain.getByRole('textbox',{name:'Cancel queued run rationale'}).fill('Obsolete internal rehearsal, never dispatched');
 page.once('dialog',dialog=>dialog.accept());
 await brain.getByRole('button',{name:'Cancel queued Brain run'}).click();
 await expect(brain.getByRole('button',{name:'Cancel queued Brain run'})).toHaveCount(0);
 const cancelled=await bff(page,'brain/runs/'+runId);
 expect(cancelled.status).toBe(200);
 expect(cancelled.data.status).toBe('CANCELLED');
 expect(cancelled.data.steps.every((x:any)=>x.status==='PENDING')).toBe(true);
 expect((await bff(page,'brain/runs/'+runId+'/execute',{})).status).toBe(409);
 expect((await bff(page,'brain/runs/'+runId+'/recovery')).data).toMatchObject({evidenceStatus:'CANCELLED_BEFORE_START',automaticReplayAllowed:false});
});
