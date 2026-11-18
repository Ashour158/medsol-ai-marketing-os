import {describe,expect,it} from 'vitest';
import {authorizeCommercialScope,type CommercialAuthorizationInput} from './commercial-scope.js';
const now=new Date('2026-11-18T12:00:00Z');
const digest='sha256:'+'a'.repeat(64);
const base=():CommercialAuthorizationInput=>({
 action:'APPROVED_PUBLISH',
 identity:{humanId:'actor-a',homeTenantId:'tenant-a',verified:true,
  grantedActions:['APPROVED_PUBLISH']},
 resource:{tenantId:'tenant-a',brandId:'brand-1',classification:'INTERNAL'},
 tenant:{active:true,entitledActions:['APPROVED_PUBLISH'],emergencyHold:false},
 brand:{brandId:'brand-1',authorized:true,policyHold:false},
 dataUse:{permitted:true,regionAllowed:true},
 external:{providerCapabilityVerified:true,destinationAuthorized:true,
  exactApproval:{approved:true,contentDigest:digest,currentContentDigest:digest,
   authorizedActorId:'actor-a',expiresAt:'2026-11-25T00:00:00Z',reviewerId:'actor-b'}}
});
describe('R1 policy preflight: immutable tenant, brand, delegation and exact scope',()=>{
 it('permits only the exact independently authorized scope when trusted facts are present',()=>{
  expect(authorizeCommercialScope(base(),now)).toEqual({
   allowed:true,reasons:[],externalEffectAuthorized:true});
 });
 it.each([
  ['cross tenant without server-resolved grant',(x:CommercialAuthorizationInput)=>{
    x.resource.tenantId='tenant-b';}],
  ['wrong brand',(x:CommercialAuthorizationInput)=>{
    x.brand!.brandId='other';}],
  ['missing role',(x:CommercialAuthorizationInput)=>{
    x.identity.grantedActions=[];}],
  ['missing entitlement',(x:CommercialAuthorizationInput)=>{
    x.tenant.entitledActions=[];}],
  ['global hold',(x:CommercialAuthorizationInput)=>{
    x.tenant.emergencyHold=true;}],
  ['provider capability revoked',(x:CommercialAuthorizationInput)=>{
    x.external!.providerCapabilityVerified=false;}],
  ['approval mutated digest',(x:CommercialAuthorizationInput)=>{
    x.external!.exactApproval!.currentContentDigest='sha256:'+'b'.repeat(64);}],
  ['self-approval',(x:CommercialAuthorizationInput)=>{
    x.external!.exactApproval!.reviewerId='actor-a';}],
  ['approval expired',(x:CommercialAuthorizationInput)=>{
    x.external!.exactApproval!.expiresAt='2026-11-17T23:00:00Z';}],
  ['data region denied',(x:CommercialAuthorizationInput)=>{
    x.dataUse.regionAllowed=false;}],
 ])('%s fails closed',(_,modify)=>{
  const x=base();modify(x);
  expect(authorizeCommercialScope(x,now).allowed).toBe(false);
  expect(authorizeCommercialScope(x,now).externalEffectAuthorized).toBe(false);
 });
 it('does not trust delegated access unless the server-grant matches tenant, brand, action and expiry',()=>{
  const x=base();x.resource.tenantId='tenant-b';x.identity.homeTenantId='agency-a';
  x.agencyGrant={agencyTenantId:'agency-a',clientTenantId:'tenant-b',
   brandIds:['brand-1'],delegatedActions:['APPROVED_PUBLISH'],serverVerified:true,
   revoked:false,expiresAt:'2026-11-30T00:00:00Z'};
  expect(authorizeCommercialScope(x,now).allowed).toBe(true);
  x.agencyGrant.revoked=true;
  expect(authorizeCommercialScope(x,now).reasons).toContain('active_verified_agency_delegation_required');
  x.agencyGrant.revoked=false;x.agencyGrant.expiresAt='2026-11-17T00:00:00Z';
  expect(authorizeCommercialScope(x,now).allowed).toBe(false);
  x.agencyGrant.expiresAt='2026-11-30T00:00:00Z';x.agencyGrant.brandIds=[];
  expect(authorizeCommercialScope(x,now).allowed).toBe(false);
 });
 it('requires independently evaluated consent for bulk email',()=>{
  const x=base();x.action='APPROVED_EMAIL_SEND';
  x.identity.grantedActions=['APPROVED_EMAIL_SEND'];
  x.tenant.entitledActions=['APPROVED_EMAIL_SEND'];
  expect(authorizeCommercialScope(x,now).reasons).toContain('audience_consent_and_suppression_required');
  x.external!.consentEligible=true;
  expect(authorizeCommercialScope(x,now).allowed).toBe(true);
 });
 it('blocks paid spend without reservation and prevents agent self-privilege changes',()=>{
  const x=base();x.action='PAID_MEDIA_SPEND';
  x.identity.grantedActions=['PAID_MEDIA_SPEND'];
  x.tenant.entitledActions=['PAID_MEDIA_SPEND'];
  expect(authorizeCommercialScope(x,now).reasons).toContain('funded_budget_reservation_required');
  x.external!.budgetReserved=true;
  expect(authorizeCommercialScope(x,now).allowed).toBe(true);
  const admin=base();admin.action='MANAGE_PRIVILEGES';
  admin.identity.grantedActions=['MANAGE_PRIVILEGES'];
  admin.tenant.entitledActions=['MANAGE_PRIVILEGES'];
  expect(authorizeCommercialScope(admin,now).reasons).toContain('separate_iam_change_workflow_required');
 });
 it('low-risk drafts do not gain external-effect authorization',()=>{
  const x=base();x.action='CREATIVE_DRAFT';x.external=null;
  x.identity.grantedActions=['CREATIVE_DRAFT'];x.tenant.entitledActions=['CREATIVE_DRAFT'];
  expect(authorizeCommercialScope(x,now)).toEqual({
   allowed:true,reasons:[],externalEffectAuthorized:false});
 });
});
