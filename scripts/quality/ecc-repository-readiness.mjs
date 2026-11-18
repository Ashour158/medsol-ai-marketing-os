import {readFileSync,statSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const MANIFEST='docs/quality/ECC_REPOSITORY_EVIDENCE_MANIFEST.json';
const IDS=new Set(['deep-analyzer','retrieval-evaluator','pr-salvage-review',
 'discussion-triage','harness-compatibility','security-evidence','ci-failure-modes']);
function validPath(root,p){
 if(typeof p!=='string'||!p||isAbsolute(p)||p.includes('\\')||p.startsWith('.')&&!p.startsWith('.github/')||
   p.split('/').some(x=>!x||x==='.'||x==='..'))return false;
 const abs=resolve(root,p),rel=relative(root,abs);
 return rel===p.split('/').join(sep)&&!rel.startsWith('..'+sep);
}
/** Repository artifact path verification; neither probes real GitHub permissions
 * nor certifies test execution, provider integration or security findings. */
export function inspectRepositoryEvidence(root=ROOT,manifest){
 const input=manifest??JSON.parse(readFileSync(resolve(root,MANIFEST),'utf8'));
 const problems=[];
 if(input?.schemaVersion!==1||input?.scope!=='ENTIRE_REPOSITORY_NOT_CHANGED_FILES'||
    !Array.isArray(input.areas)||input.areas.length!==7)
  problems.push('invalid_manifest_envelope');
 const ids=new Set(),areas=[];
 for(const item of Array.isArray(input?.areas)?input.areas:[]){
  const id=item?.id,paths=item?.paths;
  if(!IDS.has(id)||ids.has(id))problems.push('unknown_or_duplicate_area:'+String(id));
  ids.add(id);
  if(typeof item.label!=='string'||typeof item.classification!=='string'||
     typeof item.limits!=='string'||item.limits.length<30)
   problems.push('insufficient_scope_and_limitations:'+String(id));
  if(!Array.isArray(paths)||paths.length<2||new Set(paths).size!==paths.length)
   problems.push('invalid_evidence_paths:'+String(id));
  const inspected=[];
  for(const p of Array.isArray(paths)?paths:[]){
   const safe=validPath(root,p);
   let exists=false;
   if(safe){try{exists=statSync(resolve(root,p)).isFile();}catch{}}
   if(!safe||!exists)problems.push('missing_or_unsafe_evidence:'+String(id)+':'+String(p));
   inspected.push({path:p,present:exists});
  }
  areas.push({id,label:item.label,classification:item.classification,
   limitations:item.limits,evidence:inspected,pathsValid:inspected.every(x=>x.present)});
 }
 for(const id of IDS)if(!ids.has(id))problems.push('missing_area:'+id);
 const report={
  schemaVersion:1,scope:'ENTIRE_REPOSITORY_NOT_CHANGED_FILES',
  repoRevision:process.env.GITHUB_SHA??null,
  areasMapped:areas.length,evidencePathsPresent:areas.filter(a=>a.pathsValid).length,
  testsExecutedByThisReport:false,productionCapabilityCertified:false,
  independentSecurityAuditCertified:false,
  eccChecksPermissionKnownGranted:false,
  status:problems.length?'INVALID':'REFERENCE_PATHS_PRESENT_NOT_PRODUCT_CERTIFICATION',
  limitations:[
   'ECC PR comments count evidence files in a changed-file diff, not this repository scope.',
   'Source/test file presence is not evidence that its test passed; check GitHub Actions verify.',
   'Scanner job success is not an audit with zero vulnerabilities; inspect audit.exitcode and advisory records.',
   'Checks permission requires GitHub App owner request and installation owner approval.'
  ],issues:problems,areas
 };
 return report;
}
function markdown(report){
 return ['## Repository ECC reference evidence (not PR diff or product readiness)',
  '',String(report.evidencePathsPresent)+'/'+String(report.areasMapped)+' areas contain referenced on-disk files.',
  '','| Area | Classification | Referenced files |','| --- | --- | ---: |',
  ...report.areas.map(a=>'| '+a.label+' | '+a.classification+' | '+a.evidence.filter(e=>e.present).length+'/'+a.evidence.length+' |'),
  '', '**Not a capability or security certification.** See the report limitations and the real tests/artifacts.',
  '',...(report.issues.length?['Issues: '+report.issues.join(', ')]:[])].join('\n')+'\n';
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=inspectRepositoryEvidence();
 const i=process.argv.indexOf('--output');
 if(i>=0){const dest=process.argv[i+1];if(!dest||dest.startsWith('--'))throw Error('Expected --output path');
  writeFileSync(resolve(dest),JSON.stringify(report,null,2)+'\n');}
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown(report));
 process.stdout.write(markdown(report));
 if(report.issues.length)process.exitCode=1;
}
