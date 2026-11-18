import {describe,expect,it} from 'vitest';
import {assessProviderTokenLifetime} from './platform-integration-hub.service.js';

const now=new Date('2026-11-18T22:00:00.000Z');
const at=(ms:number)=>new Date(now.getTime()+ms);

describe('R2C-B diagnostic-only encrypted credential lifecycle reference cases',()=>{
 it.each([
  {name:'no credential',status:undefined,expiry:null,expired:false,soon:false,ready:false},
  {name:'revoked credential',status:'REVOKED',expiry:at(3600000),expired:false,soon:false,ready:false},
  {name:'healthy pending attestation',status:'PENDING_ATTESTATION',expiry:at(3600000),expired:false,soon:false,ready:true},
  {name:'exactly fifteen minutes left',status:'PENDING_ATTESTATION',expiry:at(900000),expired:false,soon:true,ready:false},
  {name:'one millisecond beyond near-expiry threshold',status:'PENDING_ATTESTATION',expiry:at(900001),expired:false,soon:false,ready:true},
  {name:'one millisecond before deadline',status:'PENDING_ATTESTATION',expiry:at(1),expired:false,soon:true,ready:false},
  {name:'expires at current instant',status:'PENDING_ATTESTATION',expiry:at(0),expired:true,soon:false,ready:false},
  {name:'already expired',status:'PENDING_ATTESTATION',expiry:at(-1),expired:true,soon:false,ready:false},
  {name:'missing expiry fails closed',status:'PENDING_ATTESTATION',expiry:null,expired:true,soon:false,ready:false},
  {name:'invalid date fails closed',status:'PENDING_ATTESTATION',expiry:new Date('invalid'),expired:true,soon:false,ready:false}
 ])('$name',({status,expiry,expired,soon,ready})=>{
  expect(assessProviderTokenLifetime(status,expiry,now)).toEqual({
   tokenExpired:expired,tokenExpiresWithin15Minutes:soon,
   tokenReadyForAttestation:ready,externalEffectsAuthorized:false
  });
 });
 it('fails closed when the diagnostic clock is invalid',()=>{
  expect(assessProviderTokenLifetime('PENDING_ATTESTATION',at(3600000),new Date('invalid')))
   .toEqual({tokenExpired:true,tokenExpiresWithin15Minutes:false,
    tokenReadyForAttestation:false,externalEffectsAuthorized:false});
 });
 it('never promotes token possession into provider verification or publication permission',()=>{
  for(const status of [undefined,'PENDING_ATTESTATION','REVOKED','VERIFIED']){
   for(const expiry of [null,at(-1),at(3600000)]){
    const outcome=assessProviderTokenLifetime(status,expiry,now);
    expect(outcome.externalEffectsAuthorized).toBe(false);
    if(status!=='PENDING_ATTESTATION')expect(outcome.tokenReadyForAttestation).toBe(false);
   }
  }
 });
});
