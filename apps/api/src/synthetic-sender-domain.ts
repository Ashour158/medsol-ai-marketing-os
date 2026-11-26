/** Fixed anonymous authentication fixtures; NOT a DNS resolver, SPF evaluator,
 * DKIM signature verifier, DMARC policy verifier, or provider entitlement.
 * Strict internal rehearsal policy requires both aligned mechanisms and
 * an explicit DMARC policy, even though actual DMARC may pass with only one. */
export const SENDER_DOMAIN_SCENARIOS=['ALIGNED','SPF_MISSING','SPF_PERMERROR','DKIM_MISSING',
 'DKIM_MISALIGNED','DMARC_MISSING','DMARC_MONITOR_ONLY','AUTH_TEMPERROR'] as const;
export type SenderDomainScenario=typeof SENDER_DOMAIN_SCENARIOS[number];
export function senderDomainFixture(raw:unknown){
 if(typeof raw!=='string'||!SENDER_DOMAIN_SCENARIOS.some(x=>x===raw))
  throw Error('Unknown synthetic sender-domain scenario');
 const scenario=raw as SenderDomainScenario;
 const spf=scenario==='SPF_MISSING'?'NONE':scenario==='SPF_PERMERROR'?'PERMERROR':
  scenario==='AUTH_TEMPERROR'?'TEMPERROR':'PASS';
 const dkim=scenario==='DKIM_MISSING'?'NONE':scenario==='AUTH_TEMPERROR'?'TEMPERROR':'PASS';
 const spfAligned=spf==='PASS',dkimAligned=dkim==='PASS'&&scenario!=='DKIM_MISALIGNED';
 const dmarcPolicy=scenario==='DMARC_MISSING'?'ABSENT':scenario==='DMARC_MONITOR_ONLY'?'NONE':'REJECT';
 const dmarcAlignmentResult=spfAligned||dkimAligned?'PASS':'FAIL';
 const blockers:string[]=[];
 if(!spfAligned)blockers.push('FIXTURE_SPF_NOT_ALIGNED');
 if(!dkimAligned)blockers.push('FIXTURE_DKIM_NOT_ALIGNED');
 if(dmarcPolicy==='ABSENT'||dmarcPolicy==='NONE')blockers.push('FIXTURE_DMARC_ENFORCEMENT_REQUIRED');
 return{scenario,spf,dkim,spfAligned,dkimAligned,dmarcPolicy,dmarcAlignmentResult,
  fixtureEligible:blockers.length===0,blockers,policy:'STRICT_INTERNAL_FIXTURE' as const,
  fixtureOnly:true as const,realDnsQueries:0 as const,realSignatureChecks:0 as const,
  senderDomainVerified:false as const,providerEntitlementVerified:false as const,
  realDeliverabilityVerified:false as const,externalEffectsAuthorized:false as const};
}
