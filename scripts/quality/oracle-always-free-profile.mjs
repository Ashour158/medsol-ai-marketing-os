#!/usr/bin/env node
/** Strict, non-provisioning budget/safety check for OCI Always Free staging.
 * Passing this does NOT attest to real eligibility, availability or uptime.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const fail=reason=>{throw Error('OCI_FREE_STAGING_BLOCKED: '+reason);};
export function validateOracleFreeStaging(p){
 if(!p||p.schema!=='medsol-oracle-always-free-staging-profile-v1'||
 p.provider!=='OCI'||p.environment!=='staging'||
 p.shape!=='VM.Standard.A1.Flex'||p.architecture!=='arm64'||
 !Number.isInteger(p.ocpus)||p.ocpus<1||p.ocpus>2||
 !Number.isInteger(p.memoryGb)||p.memoryGb<1||p.memoryGb>12||
 !Number.isInteger(p.bootVolumeGb)||p.bootVolumeGb<50||
 !Number.isInteger(p.otherBlockVolumesGb)||p.otherBlockVolumesGb<0||
 p.bootVolumeGb+p.otherBlockVolumesGb>200||
 p.homeRegionOnly!==true||p.monthlyBudgetUsd!==0||
 p.realProviderEffectsEnabled!==false||
 p.releaseVerdict!=='NOT_CERTIFIED'||
 !['NOT_DEPLOYED','OPERATOR_PROVISIONED_NOT_CERTIFIED'].includes(p.deploymentStatus))
 fail('Always Free A1 2-OCPU/12GB/200GB home-region budget and offline release policy required');
 for(const k of ['publicHttpsOrigin','oidcHttpsOrigin']){
  const value=p[k];if(value===null)continue;
  let url;try{url=new URL(value);}catch{fail('Invalid '+k);}
  const h=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.origin!==value||url.username||url.password||
   url.port||url.pathname!=='/'||url.search||url.hash||!h.includes('.')||
   h.endsWith('.example')||h.endsWith('.test')||h.endsWith('.invalid')||
   h==='localhost'||h.startsWith('127.')||/^\d+(\.\d+){3}$/.test(h))
   fail('Real externally owned HTTPS origin required for '+k);
 }
 if(p.publicHttpsOrigin&&p.publicHttpsOrigin===p.oidcHttpsOrigin)
  fail('OIDC and frontend require separate HTTPS origins');
 for(const k of ['immutableApiImage','immutableWebImage']){
  if(p[k]!==null&&!/^[-.a-zA-Z0-9/:_]+@sha256:[a-f0-9]{64}$/.test(p[k]))
   fail('Immutable image digest required for '+k);
 }
 if(p.deploymentStatus!=='NOT_DEPLOYED'&&(
  p.alwaysFreeEligibleConfirmed!==true||p.regionCapacityConfirmed!==true||
  !p.publicHttpsOrigin||!p.oidcHttpsOrigin||
  !p.immutableApiImage||!p.immutableWebImage))
  fail('Operator provisioning cannot be declared without observed OCI eligibility, capacity, domains and images');
 return{schema:'medsol-oci-free-profile-validation-v1',
  status:'STATIC_CONFIGURATION_ONLY',releaseVerdict:'NOT_CERTIFIED',
  proposedShape:p.shape,ocpus:p.ocpus,memoryGb:p.memoryGb,
  proposedBlockVolumeGb:p.bootVolumeGb+p.otherBlockVolumesGb,
  zeroCostNotGuaranteed:true,ociAccountAccessUsed:false,
  vmProvisionedByThisCheck:false,arm64BuildsVerified:false,
  persistentStagingIndependentlyObserved:false,
  operatorAcceptanceExecuted:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==4||process.argv[2]!=='--profile')
  fail('Usage: node scripts/quality/oracle-always-free-profile.mjs --profile <json>');
 const data=JSON.parse(readFileSync(resolve(process.argv[3]),'utf8'));
 process.stdout.write(JSON.stringify(validateOracleFreeStaging(data),null,2)+'\n');
}
