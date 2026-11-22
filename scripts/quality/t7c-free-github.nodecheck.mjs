import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const config=JSON.parse(readFileSync(new URL('.devcontainer/devcontainer.json',root),'utf8'));
const workflow=readFileSync(new URL('.github/workflows/ci.yml',root),'utf8');
test('T7C GitHub Actions manual dispatch reuses same canonical CI without shadow workflow',()=>{
 assert.match(workflow,/(?:^|\n)on:\n  push:\n    branches: \[main\]\n  pull_request:\n  workflow_dispatch:/);
 assert.match(workflow,/Run 19 Chromium cases with compiled Nest API, PostgreSQL/);
 assert.match(workflow,/Run T1F five signed-operator end-to-end browser journeys/);
});
test('T7C Codespaces uses bounded private port and disables every external provider effect',()=>{
 assert.match(config.image,/javascript-node:1-22-bookworm/);
 assert.ok(config.features['ghcr.io/devcontainers/features/docker-in-docker:2']);
 assert.deepEqual(config.forwardPorts,[3000]);
 assert.equal(config.portsAttributes['3000'].visibility,'private');
 assert.ok(!config.postCreateCommand.includes('curl'));
 assert.ok(!config.postCreateCommand.includes('terraform'));
 for(const key of [
  'MARKETING_EXTERNAL_EFFECTS_ENABLED','MARKETING_AI_REASONING_ENABLED',
  'MARKETING_REAL_EMAIL_ENABLED','MARKETING_REAL_PROVIDER_PUBLISHING_ENABLED',
  'MARKETING_PROVIDER_EGRESS_ENABLED','MARKETING_LIVE_DELIVERY_ENABLED',
  'MARKETING_LIVE_CAMPAIGN_EXECUTION_ENABLED'])
  assert.equal(config.remoteEnv[key],'false',key);
});
