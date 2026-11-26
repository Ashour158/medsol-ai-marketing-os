import {describe,it,expect} from 'vitest';
import {normalizePriceProposal,priceProposalArithmetic,priceProposalId} from './synthetic-price-proposal.js';
const input={proposalKey:'fixture-promotion-001',productId:'p1',kind:'PROMOTION',currency:'EGP',basePriceMicros:'100000000',proposedPriceMicros:'80000000',assumedUnitCostMicros:'50000000',quantity:10,expiresAt:'2026-12-01T00:00:00.000Z',scenarioOnly:true};
describe('Synthetic price and promotion scenario',()=>{
 it('calculates exact micro-currency assumptions and isolates request keys',()=>{
  expect(priceProposalArithmetic(normalizePriceProposal(input))).toEqual({baseScenarioRevenueMicros:'1000000000',proposedScenarioRevenueMicros:'800000000',proposedScenarioGrossProfitMicros:'300000000',scenarioGrossProfitDeltaMicros:'-200000000',priceChangeBasisPoints:'-2000',proposedGrossMarginBasisPoints:'3750'});
  expect(priceProposalId('org-a',input.proposalKey)).not.toBe(priceProposalId('org-b',input.proposalKey));
 });
 it('rejects unsafe or forged price assumptions',()=>{
  for(const x of [{...input,scenarioOnly:false},{...input,approved:true},{...input,currency:'USD;DROP'},{...input,proposedPriceMicros:'120000000'},{...input,proposedPriceMicros:'40000000'},{...input,quantity:0},{...input,basePriceMicros:'0'}])
   expect(()=>normalizePriceProposal(x)).toThrow();
 });
});
