import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {inspectRepositoryEvidence} from './ecc-repository-readiness.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const manifest=JSON.parse(readFileSync(resolve(root,'docs/quality/ECC_REPOSITORY_EVIDENCE_MANIFEST.json'),'utf8'));
test('all seven ECC categories have actual repository references without a product readiness claim',()=>{
 const report=inspectRepositoryEvidence(root,manifest);
 assert.equal(report.status,'REFERENCE_PATHS_PRESENT_NOT_PRODUCT_CERTIFICATION');
 assert.equal(report.areasMapped,7);
 assert.equal(report.evidencePathsPresent,7);
 assert.deepEqual(report.issues,[]);
 assert.equal(report.productionCapabilityCertified,false);
 assert.equal(report.independentSecurityAuditCertified,false);
 assert.equal(report.eccChecksPermissionKnownGranted,false);
 assert.equal(report.testsExecutedByThisReport,false);
});
test('missing reference file or fabricated category immediately invalidates the report',()=>{
 const modified=structuredClone(manifest);
 modified.areas[0].paths.push('apps/api/src/fixtures/DOES_NOT_EXIST.json');
 const r=inspectRepositoryEvidence(root,modified);
 assert.equal(r.status,'INVALID');
 assert.equal(r.evidencePathsPresent,6);
 assert.ok(r.issues.some(x=>x.includes('missing_or_unsafe_evidence')));
 const forged=structuredClone(manifest);
 forged.areas[0].id='new-bogus-area';
 assert.ok(inspectRepositoryEvidence(root,forged).issues.some(x=>x.includes('unknown_or_duplicate_area')));
});
test('unsafe, duplicate and traversal file links are rejected',()=>{
 for(const bad of ['../outside','/tmp/secret','.env','docs//quality/CI_FAILURE_MODES.md']){
  const modified=structuredClone(manifest);
  modified.areas[0].paths[0]=bad;
  assert.equal(inspectRepositoryEvidence(root,modified).status,'INVALID');
 }
 const duplicate=structuredClone(manifest);
 duplicate.areas[0].paths[1]=duplicate.areas[0].paths[0];
 assert.ok(inspectRepositoryEvidence(root,duplicate).issues.some(x=>x.includes('invalid_evidence_paths')));
});
test('the manifest does not claim unimplemented agent/interoperability/security features',()=>{
 const item=(id)=>manifest.areas.find(x=>x.id===id);
 assert.equal(item('retrieval-evaluator').classification,'LEXICAL_RETRIEVAL_ONLY');
 assert.equal(item('harness-compatibility').classification,'NEGATIVE_ADAPTER_DENIAL');
 assert.equal(item('security-evidence').classification,'SCANNER_ARTIFACT_INDEX');
 assert.equal(item('pr-salvage-review').classification,'MAINTAINER_OFFLINE_POLICY_ONLY');
});
