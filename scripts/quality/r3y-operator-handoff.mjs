#!/usr/bin/env node
/**
 * R3-Y independent acceptance operator handoff from the sole canonical
 * 500-case blueprint index. This is a checklist/chain-of-custody skeleton,
 * NEVER a completed staging test or a signed production release document.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const DIGEST=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
const ROLES=['INDEPENDENT_QA','INDEPENDENT_PENTEST',
 'PLATFORM_SECURITY','DISASTER_RECOVERY','BUSINESS_OWNER'];
const REQUIRED=['screen_or_cli_execution_record','server_side_audit_and_request_trace',
 'tenant_context_and_permission_outcome','denied_external_side_effects',
 'independent_operator_timestamp','immutable_artifact_sha256'];
function block(message){throw new Error('R3Y_OPERATOR_HANDOFF_BLOCKED: '+message)}
export function buildOperatorHandoff(index,{runId,commit,indexRaw}){
 if(!/^\d{5,18}$/.test(runId??'')||!/^[a-f0-9]{40}$/.test(commit??''))
  block('real CI run ID and immutable commit SHA required');
 if(index?.schema!=='medsol-r3y-real-stack-500-case-acceptance-index-v1'||
    index.runId!==runId||index.releaseVerdict!=='NOT_CERTIFIED'||
    index.plannedE2eCases!==500||index.totalCases!==500||
    index.mappedEngineeringAssertions!==284||
    index.referenceCasesAssertedInThisCi!==284||
    index.unmappedPlannedCases!==216||
    index.executedAndIndependentlySignedE2eCases!==0||
    index.realPublishOrEmailSendCount!==0||index.providerAccountsTested!==0||
    index.automaticallyWavable!==false)
  block('not exact same-run non-certifying canonical acceptance register');
 if(index.realStackExecutionEvidence?.actualPassedRealStackCases!==19||
    index.realStackExecutionEvidence?.independentOperatorSignoff!==false||
    index.browserExecutionEvidence?.passedCases!==51||
    index.postgresExecutionEvidence?.actualPassedDatabaseCases!==37)
  block('actual cross-stack, Chromium and PostgreSQL evidence required');
 if(!Array.isArray(index.cases)||index.cases.length!==500)
  block('exact complete 500-case inventory required');
 const ids=new Set(),out=[];
 for(const item of index.cases){
  if(!item||typeof item.id!=='string'||!/^T\d{2}-\d{3}$/.test(item.id)||
     typeof item.suite!=='string'||item.id.slice(0,3)!==item.suite||
     typeof item.area!=='string'||!item.area||
     ids.has(item.id))block('missing/duplicate/invalid case identifier');
  ids.add(item.id);
  if(item.target500E2eCaseStatus!=='UNEXECUTED'||
     item.independentlySignedOff!==false||
     item.externalEffectsAuthorized!==false||
     (item.engineeringEvidence&&(
       item.engineeringEvidence.status!=='CI_ASSERTED'||
       item.engineeringEvidence.productionE2eCoverage!==false||
       item.engineeringEvidence.operatorSignoff!==false||
       item.engineeringEvidence.providerUatVerified!==false
     )))block('attempt to pass CI results as independent E2E proof for '+item.id);
  out.push({
   id:item.id,suite:item.suite,area:item.area,
   executionEnvironment:'INDEPENDENT_PRODUCTION_LIKE_STAGING_REQUIRED',
   procedureStatus:'EXACT_CASE_STEPS_REVIEW_REQUIRED',
   engineeringBaseline:item.engineeringEvidence?{
    source:item.engineeringEvidence.testSource,
    engine:item.engineeringEvidence.contractEngine,
    ciStatus:'CI_ASSERTED',countsAsIndependentE2e:false
   }:null,
   expectedEvidenceClasses:REQUIRED,
   exactIndependentSetup:null,actorRoleAndTenant:null,exactInputs:null,
   expectedAuthoritativeDatabaseState:null,
   expectedDeniedExternalEffects:null,expectedAuditEvents:null,
   actualObservedOutcome:null,
   operatorId:null,executedAt:null,runReference:null,environmentDeploymentId:null,
   immutableArtifactDigest:null,triageReference:null,
   outcome:'NOT_EXECUTED',independentlySignedOff:false
  });
 }
 const mapped=out.filter(x=>x.engineeringBaseline).length;
 if(mapped!==284||out.filter(x=>!x.engineeringBaseline).length!==216)
  block('engineering coverage does not agree with actual 500 individual cases');
 const provenance=typeof indexRaw==='string'?indexRaw:JSON.stringify(index);
 return{
  schema:'medsol-r3y-independent-operator-handoff-v1',
  repository:'Ashour158/medsol-ai-marketing-os',
  commit,runId,sourceIndexSha256:DIGEST(provenance),
  releaseVerdict:'NOT_CERTIFIED',
  scope:'QA_PLANNING_ONLY_NO_STAGING_OPERATOR_EXECUTION_OR_SIGNOFF',
  plannedCases:500,engineeringBaselineMapped:284,
  stillUnmappedForEngineering:216,
  independentlyExecutedStagingCases:0,independentlyAcceptedCases:0,
  authenticProviderUatPerformed:false,productionDatabaseInspected:false,
  releaseAuthorizationIssued:false,
  missingMandatoryIndependentRoles:ROLES,
  signatures:[],
  readinessDependencies:[
   'External staging deployment ID and test-only tenant data without production/customer accounts',
   'Independent QA runs exact case instructions against the deployed API/frontend/database',
   'Independent tenant-role/RLS and permission-scoping security review',
   'Independent penetration test and full P0/P1 defect closure',
   'Production-like PITR/restore recovery and operational rollback drills',
   'Explicit provider staging entitlements and official reconciliation only when separately authorized',
   'Five independent Ed25519 signers using externally managed production release trust'
  ],
  operatorInstructions:'Fill every null only after independent execution and attach immutable actual evidence. Never treat this generated handoff as test results or signatures.',
  caseRecords:out
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1]};
 const input=arg('--input'),output=arg('--output');
 if(!input?.endsWith('.json')||!output?.endsWith('.json')||
    process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true')
  block('explicit JSON paths and GitHub Actions required');
 const raw=readFileSync(input,'utf8');
 const result=buildOperatorHandoff(JSON.parse(raw),{
  runId:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,indexRaw:raw
 });
 writeFileSync(resolve(output),JSON.stringify(result,null,2)+'\n');
 process.stdout.write(JSON.stringify({
  schema:result.schema,runId:result.runId,releaseVerdict:result.releaseVerdict,
  independentlyExecutedStagingCases:result.independentlyExecutedStagingCases,
  plannedCases:result.plannedCases,
  engineeringBaselineMapped:result.engineeringBaselineMapped
 },null,2)+'\n');
}
