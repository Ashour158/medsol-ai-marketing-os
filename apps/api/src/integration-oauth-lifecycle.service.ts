import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {PrismaService} from './prisma.service.js';
import {ProviderSecretEnvelope} from './provider-secret-envelope.js';

/** All configuration and exchange functions are deployment-managed, never from
 * HTTP parameters or AI agents. No live provider adapter is bundled in R2C.
 */
export type ApprovedOAuthProvider={
 providerKey:string;authorizationEndpoint:string;pinnedHostname:string;
 clientId:string;redirectUri:string;scopes:readonly string[];
};
export type TrustedOAuthExchange={
 providerKey:string;
 exchangeCode:(input:{code:string;codeVerifier:string;redirectUri:string})=>Promise<{
  accessToken:string;refreshToken?:string;expiresAt:Date;grantedScopes:readonly string[];
 }>;
};
const formatId=(s:unknown,label:string)=>{
 if(typeof s!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(s))
  throw new BadRequestException('Invalid '+label);
 return s;
};
const sha=(s:string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
export function requireActiveOAuthWindow(expiresAt:Date,now=new Date()):void{
 if(!(expiresAt instanceof Date)||!Number.isFinite(expiresAt.getTime())||
    expiresAt<=now)throw new ConflictException('OAuth authorization window expired during exchange');
}
const safeHost=(input:string)=>{
 if(!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(input)||
    input.includes('..')||input.endsWith('.local')||input.endsWith('.internal'))
  throw new BadRequestException('Approved public HTTPS host required');
};
function approvedConfig(config:ApprovedOAuthProvider){
 formatId(config.providerKey,'OAuth provider key');
 safeHost(config.pinnedHostname);
 const auth=new URL(config.authorizationEndpoint),callback=new URL(config.redirectUri);
 if(auth.protocol!=='https:'||auth.hostname!==config.pinnedHostname||
   auth.username||auth.password||auth.port||auth.hash||auth.search||
   callback.protocol!=='https:'||callback.username||callback.password||
   callback.port||callback.hash||callback.search)
  throw new BadRequestException('OAuth endpoints must be pinned HTTPS URLs without caller query');
 safeHost(callback.hostname);
 if(typeof config.clientId!=='string'||config.clientId.length<3||config.clientId.length>256)
  throw new BadRequestException('Provider client ID must be deployment-configured');
 if(!Array.isArray(config.scopes)||!config.scopes.length||config.scopes.length>12||
    config.scopes.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_./:-]{2,80}$/.test(x))||
    new Set(config.scopes).size!==config.scopes.length)
  throw new BadRequestException('Approved provider scopes must be explicit');
 return auth;
}
/** Back-end integration flow foundation.
 * A provider's OAuth broker is not a publication capability. A token obtained
 * through a broker stays PENDING_ATTESTATION until real account ownership and
 * permission verification have been independently implemented.
 */
export class IntegrationOAuthLifecycleService{
 constructor(private readonly db:PrismaService,private readonly vault:ProviderSecretEnvelope){}
 private scoped<T>(org:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  formatId(org,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async begin(org:string,actor:string,connectionIdInput:unknown,config:ApprovedOAuthProvider){
  formatId(actor,'human actor');const connectionId=formatId(connectionIdInput,'connection');
  const auth=approvedConfig(config);
  return this.scoped(org,async tx=>{
   const conn=await tx.integrationConnection.findFirst({where:{
    organizationId:org,id:connectionId,status:'PENDING_VERIFICATION'}});
   const brand=conn&&await tx.brand.findFirst({where:{
    organizationId:org,id:conn.brandId,status:'ACTIVE'}});
   if(!conn||!brand||conn.providerKey!==config.providerKey)
    throw new ConflictException('Pending tenant destination and matching approved provider required');
   const prior=await tx.providerCredential.findUnique({where:{
    organizationId_integrationConnectionId:{organizationId:org,integrationConnectionId:connectionId}}});
   if(prior)throw new ConflictException('Existing or revoked credential requires governed new connection');
   const pending=await tx.oAuthAuthorizationAttempt.findFirst({where:{
    organizationId:org,integrationConnectionId:connectionId,
    status:{in:['PENDING','EXCHANGING']},
    expiresAt:{gt:new Date()}
   }});
   if(pending)throw new ConflictException('An unexpired OAuth handshake already exists');
   const state=randomBytes(32).toString('base64url');
   const verifier=randomBytes(48).toString('base64url');
   const challenge=createHash('sha256').update(verifier).digest('base64url');
   const attemptId=randomUUID(),expiresAt=new Date(Date.now()+10*60_000);
   await tx.oAuthAuthorizationAttempt.create({data:{
    id:attemptId,organizationId:org,integrationConnectionId:connectionId,
    providerKey:config.providerKey,stateDigest:sha(state),
    encryptedCodeVerifier:this.vault.encrypt(verifier,org,connectionId,'pkce-'+attemptId),
    redirectUri:config.redirectUri,requestedScopes:[...config.scopes],
    createdBy:actor,expiresAt
   }});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:actor,
    action:'OAUTH_PKCE_HANDSHAKE_STARTED',objectType:'IntegrationConnection',
    objectId:connectionId,correlationId:attemptId,after:{
     providerKey:config.providerKey,expiresAt:expiresAt.toISOString(),
     scopesCount:config.scopes.length,credentialsConnected:false,
     externalEffectsAuthorized:false
    }}});
   const url=new URL(auth);
   url.searchParams.set('response_type','code');
   url.searchParams.set('client_id',config.clientId);
   url.searchParams.set('redirect_uri',config.redirectUri);
   url.searchParams.set('scope',config.scopes.join(' '));
   url.searchParams.set('state',state);
   url.searchParams.set('code_challenge_method','S256');
   url.searchParams.set('code_challenge',challenge);
   // The URL contains an OAuth state nonce. Do not log it.
   return{authorizationUrl:url.toString(),attemptId,expiresAt,
    connectionVerified:false,externalEffectsAuthorized:false};
  });
 }
 async exchange(org:string,stateRaw:unknown,codeRaw:unknown,broker:TrustedOAuthExchange){
  const state=typeof stateRaw==='string'?stateRaw:'';
  const code=typeof codeRaw==='string'?codeRaw:'';
  if(!/^[A-Za-z0-9_-]{40,120}$/.test(state)||
     code.length<8||code.length>2048||/[\u0000-\u0020]/.test(code))
   throw new BadRequestException('Malformed authorization state or code');
  const stateDigest=sha(state);
  const attempt=await this.scoped(org,async tx=>{
   const found=await tx.oAuthAuthorizationAttempt.findUnique({where:{
    organizationId_stateDigest:{organizationId:org,stateDigest}}});
   if(!found||found.status!=='PENDING'||found.expiresAt<=new Date())
    throw new ConflictException('OAuth authorization expired or already claimed');
   const conn=await tx.integrationConnection.findFirst({where:{
    organizationId:org,id:found.integrationConnectionId,status:'PENDING_VERIFICATION'}});
   if(!conn||conn.providerKey!==found.providerKey||
      !broker||broker.providerKey!==found.providerKey||typeof broker.exchangeCode!=='function')
    throw new ConflictException('Trusted provider broker and pending destination required');
   const changed=await tx.oAuthAuthorizationAttempt.updateMany({where:{
    id:found.id,organizationId:org,status:'PENDING',expiresAt:{gt:new Date()}},
    data:{status:'EXCHANGING',claimedAt:new Date()}});
   if(changed.count!==1)throw new ConflictException('OAuth state already claimed');
   return found;
  });
  try{
   const verifier=this.vault.decrypt(attempt.encryptedCodeVerifier,org,
    attempt.integrationConnectionId,'pkce-'+attempt.id);
   // This call is made ONLY by the trusted broker. No client-supplied URL,
   // token or providerVerified flag enters this path.
   const token=await broker.exchangeCode({code,codeVerifier:verifier,
    redirectUri:attempt.redirectUri});
   const requested=attempt.requestedScopes;
   const allowed=Array.isArray(requested)?requested.filter((x):x is string=>typeof x==='string'):[];
   if(!token||typeof token.accessToken!=='string'||token.accessToken.length<8||
      token.accessToken.length>8192||!(token.expiresAt instanceof Date)||
      !Number.isFinite(token.expiresAt.getTime())||
      token.expiresAt.getTime()<Date.now()+60_000||
      token.expiresAt.getTime()>Date.now()+365*86400_000||
      !Array.isArray(token.grantedScopes)||token.grantedScopes.length>allowed.length||
      token.grantedScopes.some(x=>typeof x!=='string'||!allowed.includes(x))||
      (token.refreshToken!==undefined&&(typeof token.refreshToken!=='string'||
       token.refreshToken.length<8||token.refreshToken.length>8192)))
    throw new ConflictException('Untrusted provider token response; cannot attest account');
   const credentials=await this.scoped(org,async tx=>{
    requireActiveOAuthWindow(attempt.expiresAt);
    const active=await tx.integrationConnection.findFirst({where:{
     organizationId:org,id:attempt.integrationConnectionId,status:'PENDING_VERIFICATION'}});
    if(!active||active.providerKey!==attempt.providerKey)
     throw new ConflictException('Destination suspended or revoked while exchanging');
    const old=await tx.providerCredential.findUnique({where:{
     organizationId_integrationConnectionId:{
      organizationId:org,integrationConnectionId:attempt.integrationConnectionId}}});
    if(old)throw new ConflictException('Credential already present or previously revoked');
    const cred=await tx.providerCredential.create({data:{
     id:randomUUID(),organizationId:org,
     integrationConnectionId:attempt.integrationConnectionId,providerKey:attempt.providerKey,
     encryptedAccessToken:this.vault.encrypt(token.accessToken,org,
      attempt.integrationConnectionId,'access-v1'),
     encryptedRefreshToken:token.refreshToken?
      this.vault.encrypt(token.refreshToken,org,attempt.integrationConnectionId,'refresh-v1'):null,
     tokenExpiresAt:token.expiresAt,grantedScopes:[...token.grantedScopes]
    }});
    const done=await tx.oAuthAuthorizationAttempt.updateMany({where:{
     id:attempt.id,organizationId:org,status:'EXCHANGING'},
     data:{status:'COMPLETE',completedAt:new Date()}});
    if(done.count!==1)throw new ConflictException('OAuth exchange claim lost');
    await tx.auditEvent.create({data:{organizationId:org,actorType:'SYSTEM',
     actorId:'trusted-oauth-broker',action:'OAUTH_TOKEN_ENCRYPTED_PENDING_ATTESTATION',
     objectType:'IntegrationConnection',objectId:attempt.integrationConnectionId,
     correlationId:attempt.id,after:{
      credentialId:cred.id,providerKey:attempt.providerKey,
      scopesCount:token.grantedScopes.length,status:cred.status,
      verifiedAccount:false,providerCapabilitiesVerified:false,
      externalEffectsAuthorized:false
     }}});
    return{credentialId:cred.id,connectionId:attempt.integrationConnectionId,
     status:'PENDING_ATTESTATION',externalEffectsAuthorized:false};
   });
   return credentials;
  }catch{
   // Authorization code may already be consumed remotely. Mark failed and
   // require a new authorization; never retry exchange blindly.
   await this.scoped(org,async tx=>{
    const changed=await tx.oAuthAuthorizationAttempt.updateMany({where:{
     id:attempt.id,organizationId:org,status:'EXCHANGING'},
     data:{status:'FAILED',completedAt:new Date()}});
    if(changed.count===1)await tx.auditEvent.create({data:{
     organizationId:org,actorType:'SYSTEM',actorId:'trusted-oauth-broker',
     action:'OAUTH_EXCHANGE_FAILED_REQUIRES_NEW_FLOW',
     objectType:'IntegrationConnection',objectId:attempt.integrationConnectionId,
     correlationId:attempt.id,after:{status:'FAILED',
      externalEffectsAuthorized:false}
    }});
   });
   throw new ConflictException('OAuth exchange failed; new authorization required');
  }
 }
 async revokeCredential(org:string,actor:string,connectionIdInput:unknown,reasonInput:unknown){
  formatId(actor,'actor');const connectionId=formatId(connectionIdInput,'connection');
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)throw new BadRequestException('Human revocation reason required');
  return this.scoped(org,async tx=>{
   const row=await tx.providerCredential.findUnique({where:{
    organizationId_integrationConnectionId:{
     organizationId:org,integrationConnectionId:connectionId}}});
   if(!row)throw new NotFoundException('Provider credential absent');
   if(row.status==='REVOKED')return{status:'REVOKED',replayed:true,externalEffectsAuthorized:false};
   const changed=await tx.providerCredential.updateMany({where:{
    id:row.id,organizationId:org,status:'PENDING_ATTESTATION',version:row.version},
    data:{status:'REVOKED',version:{increment:1},revokedAt:new Date(),revokedBy:actor}});
   if(changed.count!==1)throw new ConflictException('Concurrent credential revocation');
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:actor,
    action:'OAUTH_ENCRYPTED_CREDENTIAL_REVOKED',objectType:'IntegrationConnection',
    objectId:connectionId,correlationId:row.id,
    after:{reason,credentialId:row.id,status:'REVOKED',externalEffectsAuthorized:false}}});
   return{status:'REVOKED',replayed:false,externalEffectsAuthorized:false};
  });
 }
}
