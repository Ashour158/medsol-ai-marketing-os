import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function validateDependencyEvidence(audit,exitCode,sbom){
 const counts=audit?.metadata?.vulnerabilities;
 if(!counts||!['info','low','moderate','high','critical'].every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0))
  throw Error('Missing or invalid dependency audit severity totals');
 if(!Number.isSafeInteger(audit.metadata.totalDependencies)||audit.metadata.totalDependencies<=0||
    !audit.advisories||typeof audit.advisories!=='object'||Array.isArray(audit.advisories))
  throw Error('Missing resolved dependency audit evidence');
 if(!['0','1'].includes(String(exitCode).trim()))throw Error('Dependency audit did not complete normally');
 const findings=Object.values(audit.advisories);
 if(counts.high||counts.critical||findings.some(x=>['high','critical'].includes(x?.severity)))
  throw Error('Unresolved high or critical dependency advisory');
 if(String(exitCode).trim()==='1'&&Object.values(counts).reduce((a,b)=>a+b,0)===0)
  throw Error('Audit returned failure without a reported advisory');
 if(!/^SPDX-2\.[0-9]+$/.test(sbom?.spdxVersion??'')||
    !Array.isArray(sbom.packages)||sbom.packages.length===0)
  throw Error('Missing valid nonempty SPDX SBOM');
 return {status:'DEPENDENCY_GATE_PASSED_NOT_RELEASE_CERTIFIED',high:counts.high,critical:counts.critical,packages:sbom.packages.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=validateDependencyEvidence(JSON.parse(readFileSync('dependency-audit.json','utf8')),
  readFileSync('dependency-audit.exitcode','utf8'),JSON.parse(readFileSync('sbom.spdx.json','utf8')));
 console.log(JSON.stringify(result));
}
