import {describe,expect,it,vi,afterEach} from 'vitest';
import {TenantRolePolicyService} from './tenant-role-policy.service.js';
import {hasMarketingPermission,permissionForMarketingRoute} from './marketing-permissions.js';
const actor={userId:'admin-a',organizationId:'org-a',role:'ADMIN',
 email:'admin@example.org',subject:'oidc-admin'};
const user={id:'user-1',role:'MARKETING_MANAGER',oidcSubject:'oidc-user',tenantRoleDefinitionId:null};
function setup(){
 const tx:any={
  $queryRaw:vi.fn().mockResolvedValue([{set_config:'org-a'}]),
  user:{findFirst:vi.fn().mockImplementation(async({where}:any)=>where.id==='admin-a'?
   {role:'ADMIN',oidcSubject:'oidc-admin'}:user),
   updateMany:vi.fn().mockResolvedValue({count:1}),
   findMany:vi.fn().mockResolvedValue([{id:'user-1'}])},
  tenantRoleDefinition:{create:vi.fn().mockImplementation(async({data}:any)=>data),
   findMany:vi.fn().mockResolvedValue([]),
   findFirst:vi.fn().mockResolvedValue({id:'role-1',key:'content',
    permissions:['READ_PORTFOLIO','ASSESS'],status:'ACTIVE',version:1}),
   updateMany:vi.fn().mockResolvedValue({count:1})},
  auditEvent:{create:vi.fn().mockResolvedValue({})},
  authSession:{updateMany:vi.fn().mockResolvedValue({count:2})}
 };
 const db:any={$transaction:vi.fn((cb:any)=>cb(tx))};
 return{tx,db,svc:new TenantRolePolicyService(db)};
}
afterEach(()=>vi.unstubAllEnvs());
describe('R1B restrictive tenant roles and request-time policy',()=>{
 it('uses original MANAGE_TENANT route permission for role operations',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/tenancy/roles')).toBe('READ_TENANCY');
  expect(permissionForMarketingRoute('POST','/marketing/tenancy/roles')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/tenancy/roles/assign')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/tenancy/roles/role-1/disable')).toBe('MANAGE_TENANT');
  expect(hasMarketingPermission({...actor,role:'MARKETING_DIRECTOR'},'MANAGE_TENANT')).toBe(false);
 });
 it('creates named, distinct permission subsets only with authoritative active admin',async()=>{
  const {tx,svc}=setup();
  expect(await svc.create(actor,{key:'content_team',name:'Content Team',
   permissions:['READ_PORTFOLIO','ASSESS']})).toMatchObject({restrictiveOnly:true,status:'ACTIVE'});
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.auditEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({
   action:'TENANT_ROLE_CREATED',organizationId:'org-a'})});
  await expect(svc.create(actor,{key:'content',name:'A role',
   permissions:['READ_PORTFOLIO','UNRECOGNIZED']})).rejects.toThrow('Known');
  await expect(svc.create(actor,{key:'content',name:'A role',
   permissions:['READ_PORTFOLIO','READ_PORTFOLIO']})).rejects.toThrow('distinct');
 });
 it('restricts session on role assignment, denies target admin or privilege expansion',async()=>{
  const {tx,svc}=setup();
  expect(await svc.assign(actor,'user-1','role-1')).toMatchObject({userId:'user-1',
   roleId:'role-1',sessionsRevoked:2});
  expect(tx.user.updateMany).toHaveBeenCalledWith({where:expect.objectContaining({
   organizationId:'org-a',tenantRoleDefinitionId:null}),data:{tenantRoleDefinitionId:'role-1'}});
  expect(tx.auditEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({
   action:'TENANT_ROLE_ASSIGNED'})});
  await expect(svc.assign(actor,'admin-a','role-1')).rejects.toThrow('Self-assignment');
  tx.user.findFirst.mockImplementationOnce(async()=>({role:'ADMIN',oidcSubject:'some',tenantRoleDefinitionId:null}));
  await expect(svc.assign(actor,'user-1','role-1')).rejects.toThrow('Tenant administrators');
  tx.tenantRoleDefinition.findFirst.mockResolvedValueOnce({id:'role-1',
   permissions:['MANAGE_TENANT'],key:'dangerous'});
  await expect(svc.assign(actor,'user-1','role-1')).rejects.toThrow('exceeds');
 });
 it('disabled role revokes sessions and cannot silently restore prior privilege',async()=>{
  const {tx,svc}=setup();
  expect(await svc.disable(actor,'role-1','Retired role after governance review')).toMatchObject({
   roleId:'role-1',disabled:true,replay:false,affectedUsers:1});
  expect(tx.tenantRoleDefinition.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   data:{status:'DISABLED',version:{increment:1}}}));
  expect(tx.authSession.updateMany).toHaveBeenCalled();
  tx.tenantRoleDefinition.findFirst.mockResolvedValueOnce({id:'role-1',status:'DISABLED',version:2});
  expect(await svc.disable(actor,'role-1','Retired role after governance review')).toMatchObject({replay:true});
 });
 it('enforces built-in ceiling and current tenant role on every request',async()=>{
  const {tx,svc}=setup();
  const operator={userId:'user-1',organizationId:'org-a',role:'MARKETING_MANAGER',
   email:'user@example.org',subject:'oidc-user'};
  tx.user.findFirst.mockResolvedValue({role:'MARKETING_MANAGER',
   tenantRoleDefinitionId:'role-1'});
  await expect(svc.assertActorPermission(operator,'READ_PORTFOLIO')).resolves.toBeUndefined();
  await expect(svc.assertActorPermission(operator,'DECIDE_APPROVAL')).rejects.toThrow('permission denied');
  await expect(svc.assertActorPermission(operator,'EXECUTE_WORKFLOW')).rejects.toThrow('Tenant role policy denies');
  tx.tenantRoleDefinition.findFirst.mockResolvedValueOnce(null);
  await expect(svc.assertActorPermission(operator,'READ_PORTFOLIO')).rejects.toThrow('Tenant role policy denies');
  tx.user.findFirst.mockResolvedValueOnce(null);
  await expect(svc.assertActorPermission(operator,'READ_PORTFOLIO')).rejects.toThrow('permissions changed');
  vi.stubEnv('MARKETING_REQUIRE_TENANT_ROLE','true');
  tx.user.findFirst.mockResolvedValueOnce({role:'MARKETING_MANAGER',tenantRoleDefinitionId:null});
  await expect(svc.assertActorPermission(operator,'READ_PORTFOLIO')).rejects.toThrow('Explicit tenant role');
 });
});
