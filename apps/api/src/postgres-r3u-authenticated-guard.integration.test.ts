import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {PrismaClient} from "@prisma/client";
import {randomUUID} from "node:crypto";
import {BootstrapAuthGuard} from "./bootstrap-auth.guard.js";
import {AuthSessionService} from "./auth-session.service.js";
import {TenantRolePolicyService} from "./tenant-role-policy.service.js";
import {verifyOidcIdentity} from "./oidc-identity.js";
vi.mock("./oidc-identity.js",()=>({verifyOidcIdentity:vi.fn()}));

/** Authenticated API guard + real tenant user/session/role database transactions.
 * Only the OIDC issuer transport is simulated; no Entra/other real account.
 * Same canonical production guard and role policy are used.
 */
const enabled=process.env.MARKETING_DB_INTEGRATION==="1";
const originals={...process.env};
const db=new PrismaClient();
const a="r3u-auth-a-"+randomUUID(),b="r3u-auth-b-"+randomUUID();
const userId=()=>randomUUID(),email=(name:string)=>name+"-"+randomUUID()+"@example.invalid";
type Identity={userId:string;organizationId:string;email:string;role:string;subject:string};
let admin:Identity,foreign:Identity,viewer:Identity,limited:Identity;
let sessions:AuthSessionService,guard:BootstrapAuthGuard;
const context=(req:unknown):any=>({switchToHttp:()=>({getRequest:()=>req})});
const inbound=(identity:Identity,sessionId:string,method="GET",path="/marketing/overview")=>({
 url:path,method,headers:{"authorization":"Bearer OFFLINE_JWT_NOT_AN_ENTRA_TOKEN",
  "x-organization-id":a,"x-marketing-session-id":sessionId} as Record<string,unknown>,
 body:{organizationId:a},identity:undefined as unknown
});
function oidc(identity:Identity){vi.mocked(verifyOidcIdentity).mockResolvedValue(identity);}
async function signIn(identity:Identity){
 return sessions.register(identity.organizationId,identity.userId,Date.now()+10*60_000);
}
describe.skipIf(!enabled)("R3-U real PostgreSQL session/revocation/role guard acceptance, no external OIDC",()=>{
 beforeAll(async()=>{
  process.env.MARKETING_AUTH_MODE="oidc";
  process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID=a;
  process.env.MARKETING_REQUIRE_TENANT_ROLE="false";
  await db.$connect();
  await db.organization.createMany({data:[
   {id:a,name:"Synthetic OIDC A"}, {id:b,name:"Synthetic OIDC B"}
  ]});
  async function make(org:string,role:string,name:string):Promise<Identity>{
   const id=userId(),subject="oidc-r3u-"+randomUUID();
   const address=email(name);
   await db.user.create({data:{id,organizationId:org,
    name:"R3U "+name,email:address,role,oidcSubject:subject}});
   return{userId:id,organizationId:org,email:address,role,subject};
  }
  admin=await make(a,"ADMIN","admin");
  foreign=await make(b,"ADMIN","foreign");
  viewer=await make(a,"VIEWER","viewer");
  limited=await make(a,"ADMIN","soon-downgraded");
  sessions=new AuthSessionService(db as any);
  guard=new BootstrapAuthGuard(db as any,new TenantRolePolicyService(db as any));
 },60000);
 afterAll(async()=>{process.env={...originals};await db.$disconnect();});
 it("T01-017 allows an authenticated tenant owner with an active real database session and current role",async()=>{
  const session=await signIn(admin);oidc(admin);
  const req=inbound(admin,session.sessionId);
  expect(await guard.canActivate(context(req))).toBe(true);
  expect(req.identity).toMatchObject({userId:admin.userId,organizationId:a,role:"ADMIN"});
  expect(req.headers["x-organization-id"]).toBe(a);
 });
 it("T01-018 rejects tenant headers and JSON body claims differing from the provisioned organization",async()=>{
  const session=await signIn(admin);oidc(admin);
  const forged=inbound(admin,session.sessionId);
  forged.headers["x-organization-id"]=b;
  await expect(guard.canActivate(context(forged))).rejects.toThrow("Cross-tenant");
  const forgedBody=inbound(admin,session.sessionId);
  forgedBody.body.organizationId=b;
  await expect(guard.canActivate(context(forgedBody))).rejects.toThrow("Cross-tenant");
 });
 it("T01-019 denies foreign-tenant session IDs even when the OIDC subject belongs to tenant A",async()=>{
  const sessionB=await signIn(foreign);oidc(admin);
  const req=inbound(admin,sessionB.sessionId);
  await expect(guard.canActivate(context(req))).rejects.toThrow("Session expired or revoked");
 });
 it("T01-020 refuses an OIDC token whose database role changed, even if the actor still has a valid session",async()=>{
  const session=await signIn(limited);
  oidc(limited);
  await db.user.update({where:{id:limited.userId},data:{role:"VIEWER"}});
  await expect(guard.canActivate(context(inbound(limited,session.sessionId))))
   .rejects.toThrow("permissions changed or disabled");
 });
 it("T03-029 rejects VIEWER campaign writes before calling an unauthorized domain owner",async()=>{
  const session=await signIn(viewer);oidc(viewer);
  await expect(guard.canActivate(context(inbound(viewer,session.sessionId,
   "POST","/marketing/campaigns")))).rejects.toThrow("MANAGE_CAMPAIGN");
 });
 it("T03-030 rejects forged permission routes and disallowed verbs regardless of session validity",async()=>{
  const session=await signIn(admin);oidc(admin);
  for(const [method,path] of [["POST","/marketing/email/send"],
   ["DELETE","/marketing/campaigns"],["POST","/marketing/approvals/override"]]){
   await expect(guard.canActivate(context(inbound(admin,session.sessionId,method,path))))
    .rejects.toThrow("permission registry");
  }
 });
 it("T15-029 revoked tenant session cannot be replayed by a holder of the former encrypted cookie",async()=>{
  const session=await signIn(admin);oidc(admin);
  expect(await guard.canActivate(context(inbound(admin,session.sessionId)))).toBe(true);
  expect(await sessions.revoke(a,admin.userId,session.sessionId)).toEqual({revoked:true});
  await expect(guard.canActivate(context(inbound(admin,session.sessionId))))
   .rejects.toThrow("Session expired or revoked");
 });
 it("T15-030 refuses expired and missing server sessions, without activating any provider",async()=>{
  const past=await db.authSession.create({data:{
   id:randomUUID(),organizationId:a,userId:admin.userId,
   expiresAt:new Date(Date.now()-60000)}});
  oidc(admin);
  await expect(guard.canActivate(context(inbound(admin,past.id))))
   .rejects.toThrow("Session expired or revoked");
  const missing=inbound(admin,randomUUID());
  delete missing.headers["x-marketing-session-id"];
  await expect(guard.canActivate(context(missing))).rejects.toThrow("Active server session required");
  expect(await db.providerCredential.count({where:{organizationId:a}})).toBe(0);
 },60000);
});
