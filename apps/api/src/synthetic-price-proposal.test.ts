import {describe,it,expect} from 'vitest';
import {normalizePriceProposal,priceProposalArithmetic,priceProposalId,buildPriceProposal,readPriceProposal,SYNTHETIC_PRICING} from './synthetic-price-proposal.js';
const input={proposalKey:'fixture-promotion-001',productId:'p1',kind:'PROMOTION',currency:'EGP',basePriceMicros:'100000000',proposedPriceMicros:'80000000',assumedUnitCostMicros:'50000000',quantity:10,expiresAt:'2026-12-01T00:00:00.000Z',scenarioOnly:true};
describe('Synthetic price and promotion scenario',()=>{
 it('calculates exact micro-currency assumptions and isolates request keys',()=>{
  expect(priceProposalArithmetic(normalizePriceProposal(input))).toEqual({baseScenarioRevenueMicros:'1000000000',proposedScenarioRevenueMicros:'800000000',proposedScenarioGrossProfitMicros:'300000000',scenarioGrossProfitDeltaMicros:'-200000000',priceChangeBasisPoints:'-2000',proposedGrossMarginBasisPoints:'3750'});
  expect(priceProposalId('org-a',input.proposalKey)).not.toBe(priceProposalId('org-b',input.proposalKey));
 });
 it('survives JSONB key reordering but rejects scope tampering',async()=>{
  const tx={marketingProduct:{findFirst:async()=>({updatedAt:new Date('2026-11-26T00:00:00Z'),code:'SKU',name:'Product',vendor:null,lifecycle:'ACTIVE',marketingProfile:null})}};
  const i=normalizePriceProposal(input),{scope,scopeDigest}=await buildPriceProposal(tx as any,'org-a','author',i,new Date('2026-11-26T00:00:00Z'));
  const reordered=Object.fromEntries(Object.entries(scope).reverse());
  const a={id:priceProposalId('org-a',i.proposalKey),organizationId:'org-a',requestedBy:'author',objectId:'p1',objectType:SYNTHETIC_PRICING,requiredAuthority:'HUMAN_MARKETING_AUTHORITY',scopeExpiresAt:new Date(i.expiresAt),scope:reordered,scopeDigest};
  expect(readPriceProposal(a as any)).toEqual(scope);
  expect(()=>readPriceProposal({...a,scope:{...scope,externalEffectsAuthorized:true}} as any)).toThrow('scope invalid');
 });
 it('rejects unsafe or forged price assumptions',()=>{
  for(const x of [{...input,scenarioOnly:false},{...input,approved:true},{...input,currency:'USD;DROP'},{...input,proposedPriceMicros:'120000000'},{...input,proposedPriceMicros:'40000000'},{...input,quantity:0},{...input,basePriceMicros:'0'}])
   expect(()=>normalizePriceProposal(x)).toThrow();
 });
});
