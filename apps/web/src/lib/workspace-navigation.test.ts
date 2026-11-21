import {describe,expect,it} from 'vitest';
import {WORKSPACE_LINKS,filterWorkspaceLinks} from './workspace-navigation';
describe('T3A single-authority workspace directory',()=>{
 it('has unique, safe anchors and no invented standalone engines',()=>{
  const ids=WORKSPACE_LINKS.map(x=>x.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain('journey');
  expect(ids).toContain('agent-brain');
  expect(ids).toContain('acceptance');
  expect(ids.every(id=>/^[a-z][a-z0-9-]+$/.test(id))).toBe(true);
 });
 it('searches existing UI surfaces without inventing server entitlements',()=>{
  const a=filterWorkspaceLinks('blueprint');
  expect(a).toHaveLength(1);
  expect(a[0]?.id).toBe('blueprint-studio');
  expect(filterWorkspaceLinks('  GOVERN  ').length).toBeGreaterThan(1);
  expect(filterWorkspaceLinks('nonexistent feature')).toEqual([]);
  expect(filterWorkspaceLinks('z'.repeat(101))).toEqual([]);
 });
});
