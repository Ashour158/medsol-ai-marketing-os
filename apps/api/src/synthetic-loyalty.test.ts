import {describe,it,expect} from 'vitest';
import {normalizeLoyalty,loyaltyId} from './synthetic-loyalty.js';
const input={brandId:'b1',campaignId:'c1',contactId:'p1',sourceEventKey:'fixture-event-001',kind:'EARN',points:100,expiresAt:'2026-12-01T00:00:00.000Z',fixtureOnly:true};
describe('fictional loyalty inputs',()=>{
 it('binds one fixture key per tenant',()=>{expect(normalizeLoyalty(input)).toEqual(input);expect(loyaltyId('a',input.sourceEventKey)).not.toBe(loyaltyId('b',input.sourceEventKey));});
 it('refuses actual financial or ambiguous rewards',()=>{for(const v of [{...input,fixtureOnly:false},{...input,cashValue:100},{...input,points:-1},{...input,points:0.5},{...input,points:100001},{...input,kind:'PAY'},{...input,contactId:'../real'}])expect(()=>normalizeLoyalty(v)).toThrow();});
});
