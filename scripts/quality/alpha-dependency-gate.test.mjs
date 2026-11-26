import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDependencyEvidence as validate} from './alpha-dependency-gate.mjs';
const audit=()=>({metadata:{totalDependencies:320,vulnerabilities:{info:0,low:0,moderate:0,high:0,critical:0}},advisories:{}});
const sbom={spdxVersion:'SPDX-2.3',packages:[{name:'example'}]};
test('valid evidence permits engineering only',()=>assert.equal(validate(audit(),'0',sbom).status,'DEPENDENCY_GATE_PASSED_NOT_RELEASE_CERTIFIED'));
test('high severity blocks even if scanner process succeeded',()=>{const a=audit();a.metadata.vulnerabilities.high=1;assert.throws(()=>validate(a,'0',sbom),/high or critical/);});
test('individual critical advisory blocks inconsistent totals',()=>{const a=audit();a.advisories.x={severity:'critical'};assert.throws(()=>validate(a,'1',sbom),/high or critical/);});
test('missing or failed scan and empty SBOM block release',()=>{
 assert.throws(()=>validate({},'0',sbom));assert.throws(()=>validate(audit(),'2',sbom));
 assert.throws(()=>validate(audit(),'1',sbom));assert.throws(()=>validate(audit(),'0',{...sbom,packages:[]}));
});
test('reported moderate findings remain visible without falsely blocking high-severity gate',()=>{const a=audit();a.metadata.vulnerabilities.moderate=1;a.advisories.x={severity:'moderate'};assert.equal(validate(a,'1',sbom).high,0);});
