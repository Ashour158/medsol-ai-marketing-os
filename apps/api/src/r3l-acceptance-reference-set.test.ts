import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {hasMarketingPermission,permissionForMarketingRoute}
 from './marketing-permissions.js';
import {parseToolManifest} from './governed-tool-manifest.js';
import {safeForAgentEvidence} from './agent-content-firewall.js';
import {deliveryDelayMs} from './outbox-publisher.service.js';
type R3LCase={
 id:string;suite:string;evidenceClass:string;kind:string;
 parameters:Record<string,unknown>;expected:Record<string,unknown>;
 owner:string;setup:string;expectedDeniedSideEffects:string[];trace:string
};
const data=JSON.parse(readFileSync(
 new URL('./fixtures/r3l-acceptance-reference-set.json',import.meta.url),
 'utf8')) as {schema:string;cases:R3LCase[]};
const positiveTool={
 kind:'MCP',serverKey:'r3l_synthetic_tool',name:'Synthetic internal read',
 endpointOrigin:'https://tools.example.org',
 toolKeys:['read_internal'],declaredScopes:['read_internal'],
 trustTier:'T2',dataClass:'INTERNAL',supportsWrites:false,
 maxResponseBytes:12000,timeoutMs:2000
};
describe('R3-L executable acceptance case reference set (offline unit evidence only)',()=>{
 it('has unique stable non-certifying coverage IDs and explicit denied side effects',()=>{
  expect(data.schema).toBe('medsol-r3l-acceptance-reference-v1');
  expect(data.cases).toHaveLength(110);
  expect(new Set(data.cases.map(x=>x.id)).size).toBe(110);
  for(const c of data.cases){
   expect(c.id).toMatch(/^T(?:02|03|06|07|15)-\d{3}$/);
   expect(c.evidenceClass).toBe('OFFLINE_UNIT_ASSERTION');
   expect(c.expectedDeniedSideEffects).toContain('no_real_provider_requests');
   expect(c.owner.length).toBeGreaterThan(5);
  }
 });
 it.each(data.cases)('$id — $kind',c=>{
  switch(c.kind){
   case 'ROLE_BOUNDARY':{
    const identity={organizationId:'r3l-synthetic',userId:'tester',
     subject:'offline-verified-placeholder',email:'test@example.invalid',
     role:c.parameters.role as string};
    expect(hasMarketingPermission(identity,
     c.parameters.permission as Parameters<typeof hasMarketingPermission>[1]))
     .toBe(c.expected.authorized);
    break;
   }
   case 'UNREGISTERED_ROUTE':{
    expect(()=>permissionForMarketingRoute(
     c.parameters.method as string,c.parameters.path as string))
     .toThrow('not in the permission registry');
    break;
   }
   case 'TOOL_ORIGIN':{
    expect(()=>parseToolManifest({...positiveTool,
     endpointOrigin:c.parameters.endpointOrigin})).toThrow();
    break;
   }
   case 'AGENT_SOURCE_INSTRUCTION':{
    expect(safeForAgentEvidence(c.parameters.text))
     .toBe(c.expected.agentEligible);
    break;
   }
   case 'OUTBOX_BACKOFF':{
    expect(deliveryDelayMs(c.parameters.attempt as number))
     .toBe(c.expected.milliseconds);
    break;
   }
   default:throw new Error('Reference case has unknown test engine: '+c.kind);
  }
 });
});
