/** A compact manually authored business profile stored by the existing
 * KnowledgeDocument owner. No second identity/master, no external retrieval. */
export const BUSINESS_PROFILE_PREFIX='business-profile-';
export const BUSINESS_PROFILE_AGENTS=['MKT-BRAND-001','MKT-STR-001','MKT-CMO-001'] as const;
const fields={name:60,industry:60,offerings:100,audience:100,territories:80,differentiators:120} as const;
type ProfileField=keyof typeof fields;
export type BusinessProfile=Record<ProfileField,string>;
export function parseBusinessProfile(raw:unknown):BusinessProfile{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==Object.keys(fields).length||
  Object.keys(raw).some(k=>!(Object.prototype.hasOwnProperty.call(fields,k))))throw Error('Exact structured business profile required');
 const values=raw as Record<string,unknown>,out={} as BusinessProfile;
 for(const key of Object.keys(fields) as ProfileField[]){
  const x=values[key];
  if(typeof x!=='string'||x.trim().length<2||x.length>fields[key]||/[<>\u0000-\u001f\u007f-\u009f]/u.test(x))
   throw Error('Invalid business profile field: '+key);
  out[key]=x.trim();
 }
 return out;
}
export function serializeBusinessProfile(profile:BusinessProfile){
 const text=JSON.stringify({schema:'medsol.business-profile.v1',...parseBusinessProfile(profile)});
 if(text.length>800)throw Error('Business profile exceeds single source chunk bound');
 return text;
}
export function decodeBusinessProfile(text:string):BusinessProfile|null{
 try{
  const raw=JSON.parse(text);
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.schema!=='medsol.business-profile.v1')return null;
  const {schema,...fields}=raw,profile=parseBusinessProfile(fields);
  return serializeBusinessProfile(profile)===text?profile:null;
 }catch{return null;}
}
