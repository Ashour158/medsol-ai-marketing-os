import {describe,expect,it,vi} from 'vitest';
import {permissionForMarketingRoute} from './marketing-permissions.js';
import {LockedOfficialProviderDispatchGateway} from './official-social-publishing.port.js';
import {SOCIAL_PROVIDER_SIMULATION_SCENARIOS,
 simulateProviderTransport} from './social-provider-simulation.js';
import {SYNTHETIC_EMAIL_SCENARIOS,
 simulateSyntheticEmailTransport} from './synthetic-email-transport.js';
import {parseSyntheticJourney,simulateSyntheticJourney}
 from './synthetic-email-journey.js';
import {parseToolManifest,inspectToolInvocation,assertToolRemoteDispatchBlocked}
 from './governed-tool-manifest.js';
import {simulateBlueprintDraft} from '@medsol/contracts';
import {MODEL_PROVIDER_KEYS,SimulatedModelAdapter,
 BoundedModelGateway,type ModelRequest} from '@medsol/agent-runtime';

const sha='sha256:'+'a'.repeat(64);
describe('R2/R3 independent negative-control release audit (offline)',()=>{
 it('forbids all live social, email, MCP/A2A and blueprint deployment endpoints',()=>{
  const forbidden=[
   ['POST','/marketing/publications/abc/publish'],
   ['POST','/marketing/email/send'],
   ['POST','/marketing/email/dispatch'],
   ['POST','/marketing/tools/execute'],
   ['POST','/marketing/tools/registrations/abc/execute'],
   ['POST','/marketing/architecture/blueprint/deploy'],
   ['POST','/marketing/agents/autonomous-publish']
  ];
  for(const [method,path] of forbidden)
   expect(()=>permissionForMarketingRoute(method!,path!))
    .toThrow('not in the permission registry');
 });
 it('cannot invoke even a forged fully approved official provider publish permit',async()=>{
  const provider={providerKey:'META_GRAPH',capabilityManifestVersion:'test',
   publish:vi.fn(),inspectAccountCapability:vi.fn(),
   inspectRemotePost:vi.fn()} as any;
  await expect(new LockedOfficialProviderDispatchGateway()
   .publish(provider,{} as any,{} as any)).rejects.toThrow('egress is locked');
  expect(provider.publish).not.toHaveBeenCalled();
  expect(provider.inspectRemotePost).not.toHaveBeenCalled();
 });
 it('all twelve social failure modes produce zero actual sends and verified receipts',()=>{
  for(const scenario of SOCIAL_PROVIDER_SIMULATION_SCENARIOS){
   const output=simulateProviderTransport({organizationId:'tenant-a',
    publicationId:'publication-a',integrationConnectionId:'connection-a',
    providerKey:'META_GRAPH',scopeDigest:sha,
    scenario,requestKey:'audit-immutable-request'});
   expect(output.realProviderRequests).toBe(0);
   expect(output.verifiedRemoteReceipts).toBe(0);
   expect(output.externalEffectsAuthorized).toBe(false);
   expect(output.automaticRetryAllowed).toBe(false);
  }
 });
 it('all twelve ESP failure modes and multi-step journeys remain synthetic',()=>{
  for(const scenario of SYNTHETIC_EMAIL_SCENARIOS){
   const output=simulateSyntheticEmailTransport({organizationId:'tenant-a',
    brandId:'brand-a',campaignId:'campaign-a',contentDigest:sha,
    audienceDigest:sha,eligibleCount:3,scenario});
   expect(output.realProviderRequests).toBe(0);
   expect(output.actualMessagesSent).toBe(0);
   expect(output.verifiedProviderReceipts).toBe(0);
   expect(output.automaticRetryAllowed).toBe(false);
  }
  const definition=parseSyntheticJourney({timeZone:'UTC',
   startAt:'2026-11-20T10:00:00Z',
   quietHours:{start:'22:00',end:'07:00'},
   dailyCap:1,rolling7DayCap:3,
   steps:[{key:'welcome',delayMinutes:0,scenario:'ACCEPTED'},
    {key:'follow_up',delayMinutes:0,scenario:'TIMEOUT_AFTER_ACCEPT'}]});
  const result=simulateSyntheticJourney({organizationId:'tenant-a',
   brandId:'brand-a',campaignId:'campaign-a',contentDigest:sha,
   audienceDigest:sha,eligibleAtSnapshot:3,definition});
  expect(result).toMatchObject({actualMessagesSent:0,realProviderRequests:0,
   verifiedProviderReceipts:0,automaticRetryAllowed:false,
   requiresFreshConsentAtExecution:true,externalEffectsAuthorized:false});
 });
 it('approved signed MCP/A2A metadata cannot authorize any remote tool',()=>{
  for(const kind of ['MCP','A2A'] as const){
   const manifest=parseToolManifest({kind,serverKey:'audited_tool',
    name:'Audited Tool',endpointOrigin:'https://tools.example.org',
    toolKeys:['read_only'],declaredScopes:['read_internal'],trustTier:'T2',
    dataClass:'INTERNAL',supportsWrites:false,
    maxResponseBytes:20000,timeoutMs:2000});
   const result=inspectToolInvocation(manifest,'read_only','read_internal','APPROVED');
   expect(result).toMatchObject({approvedMetadata:true,
    remoteExecutionAuthorized:false,mcpCalls:0,a2aCalls:0,
    externalEffectsAuthorized:false});
   expect(()=>assertToolRemoteDispatchBlocked()).toThrow('not authorized');
  }
 });
 it('virtual blueprint cannot execute agents, tools, models or domain commands',()=>{
  const output=simulateBlueprintDraft({id:'audit-workflow',version:1,
   nodes:[{id:'start',type:'TRIGGER'},
    {id:'agent',type:'AGENT_TASK',agentId:'MKT-CMO-001'},
    {id:'end',type:'END'}],
   edges:[{from:'start',to:'agent'},{from:'agent',to:'end'}]});
  expect(output).toMatchObject({status:'SIMULATED',executable:false,
   deployAuthorized:false,realAgentExecutions:0,actualModelCalls:0,
   actualMcpCalls:0,actualA2aCalls:0,actualDomainWrites:0,
   providerRequestsMade:0,externalEffectsAuthorized:false});
 });
 it('four offline model-provider protocols never claim real AI inference or cost',async()=>{
  const request:ModelRequest={organizationId:'tenant-a',agentId:'MKT-CMO-001',
   correlationId:'audit-corr',purpose:'INTERNAL_MARKETING_DRAFT',
   input:'Internal audit test only',maxOutputTokens:120,
   timeoutMs:1000,estimatedCostMicros:100};
  for(const providerKey of MODEL_PROVIDER_KEYS){
   const result=await new BoundedModelGateway(new SimulatedModelAdapter({
    providerKey,scenario:'SUCCESS'})).complete(request);
   expect(result.text).toContain('NO AI INFERENCE');
   expect(result.actualCostMicros).toBe(0);
  }
 });
});
