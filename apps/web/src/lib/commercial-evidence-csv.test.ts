import {describe,it,expect} from 'vitest';
import {reviewedCommercialEvidenceCsv as csv,type CommercialEvidenceManifest} from './offline-evidence-csv';
const fp='sha256:'+'a'.repeat(64);
const manifest=():CommercialEvidenceManifest=>({status:'BOUNDED_REVIEWED_SOURCE_MANIFEST',rowCount:2,sourceDigest:fp,
 independentVerification:false,attributionValidated:false,revenueVerified:false,roiValidated:false,
 fxConversionPerformed:false,signed:false,externalEffectsAuthorized:false,
 groups:[{recordDigest:fp,funnelStatus:'NO_COMPLETE_MATCHED_GROUPS',monetaryStatus:'EXACT_MONETARY_SOURCE_MATCH',
 metrics:[{metricKey:'spend_micros',value:'1000000',currency:'EGP'},{metricKey:'reported_revenue_micros',value:'5000000',currency:'EGP'}]}]});
const report=()=>({organizationId:'org',campaign:{id:'campaign'},evidenceManifest:manifest()});
describe('Reviewed commercial CSV',()=>{
 it('preserves currency and flags unsigned evidence, no finance proof',()=>{
  const s=csv(report(),'org','campaign');
  expect(s).toContain('EGP');expect(s).toContain('5000000');expect(s).toContain('NOT_CERTIFIED');
  expect(s).toContain('UNSIGNED_FINGERPRINT_NOT_SIGNATURE');expect(s).toContain('NOT_CAUSAL_ATTRIBUTION');
 });
 it('rejects scope mismatch, altered flags, row bound, duplicate metrics and malformed values',()=>{
  expect(()=>csv(report(),'other','campaign')).toThrow('OFFLINE_CSV_BLOCKED');
  expect(()=>csv(report(),'org','other')).toThrow('OFFLINE_CSV_BLOCKED');
  for(const patch of [{rowCount:3},{signed:true},{status:'ROW_LIMIT_EXCEEDED'}])
   expect(()=>csv({...report(),evidenceManifest:{...manifest(),...patch} as CommercialEvidenceManifest},'org','campaign')).toThrow('OFFLINE_CSV_BLOCKED');
  for(const patch of [{currency:'=CMD'},{value:'=1+1'},{metricKey:'unknown'},{currency:null,metricKey:'reported_revenue_micros'}]){
   const r=report();Object.assign(r.evidenceManifest.groups[0]!.metrics[0]!,patch);
   expect(()=>csv(r,'org','campaign')).toThrow('OFFLINE_CSV_BLOCKED');
  }
 });
});
