import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateOracleFreeStaging} from './oracle-always-free-profile.mjs';
const valid=()=>({
 schema:'medsol-oracle-always-free-staging-profile-v1',
 provider:'OCI',environment:'staging',shape:'VM.Standard.A1.Flex',
 architecture:'arm64',ocpus:2,memoryGb:12,bootVolumeGb:50,
 otherBlockVolumesGb:0,homeRegionOnly:true,monthlyBudgetUsd:0,
 realProviderEffectsEnabled:false,releaseVerdict:'NOT_CERTIFIED',
 deploymentStatus:'NOT_DEPLOYED',alwaysFreeEligibleConfirmed:false,
 regionCapacityConfirmed:false,publicHttpsOrigin:null,oidcHttpsOrigin:null,
 immutableApiImage:null,immutableWebImage:null
});
test('Oracle staging profile never pretends it deployed or certified',()=>{
 const x=validateOracleFreeStaging(valid());
 assert.equal(x.status,'STATIC_CONFIGURATION_ONLY');
 assert.equal(x.vmProvisionedByThisCheck,false);
 assert.equal(x.ociAccountAccessUsed,false);
 assert.equal(x.operatorAcceptanceExecuted,0);
});
test('rejects paid capacity, wrong architecture, non-home region and live egress',()=>{
 for(const override of [{ocpus:3},{memoryGb:13},{bootVolumeGb:201},
  {shape:'VM.Standard.E5.Flex'},{architecture:'amd64'},
  {homeRegionOnly:false},{monthlyBudgetUsd:1},
  {realProviderEffectsEnabled:true},{releaseVerdict:'CERTIFIED'}])
  assert.throws(()=>validateOracleFreeStaging({...valid(),...override}),
   /OCI_FREE_STAGING_BLOCKED/);
});
test('rejects fake hostnames, unpinned images and premature provisioning claims',()=>{
 for(const override of [
  {publicHttpsOrigin:'https://marketing.example'},
  {publicHttpsOrigin:'http://marketing.example.com'},
  {oidcHttpsOrigin:'https://localhost'},
  {immutableApiImage:'latest'},
  {deploymentStatus:'OPERATOR_PROVISIONED_NOT_CERTIFIED'},
  {publicHttpsOrigin:'https://staging.medsol.org',oidcHttpsOrigin:'https://staging.medsol.org'}
 ])assert.throws(()=>validateOracleFreeStaging({...valid(),...override}),
  /OCI_FREE_STAGING_BLOCKED/);
});
