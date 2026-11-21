import {describe,expect,it} from 'vitest';
import {permissionForMarketingRoute} from './marketing-permissions.js';
import {baselineAgentReleaseManifest} from './agent-manifest-release.js';
import {AGENT_ROSTER} from '@medsol/agent-runtime';

describe('Agent Release Studio reuses signed, restrictive domain authority',()=>{
 it('authorizes baseline read as TENANT administration, not public access',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/agents/manifests/baseline/MKT-CMO-001')).toBe('READ_TENANCY');
  expect(permissionForMarketingRoute('POST','/marketing/agents/manifests')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/agents/manifests/rev-1/activate')).toBe('MANAGE_TENANT');
 });
 it('prepares only known offline-review canonical agents',()=>{
  expect(AGENT_ROSTER).toHaveLength(13);
  const m=baselineAgentReleaseManifest('MKT-CMO-001');
  expect(m.modelPolicy).toBe('OFFLINE_ONLY');
  expect(m.toolKeys).toEqual([]);
  expect(m.humanReviewRequired).toBe(true);
 });
});
