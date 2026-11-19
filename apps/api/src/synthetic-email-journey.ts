import {createHash} from 'node:crypto';
import {assertSyntheticEmailScenario,simulateSyntheticEmailTransport,
 type SyntheticEmailScenario} from './synthetic-email-transport.js';

export type SyntheticJourneyDefinition={
 timeZone:string;startAt:string;
 quietHours:{start:string;end:string};
 dailyCap:number;rolling7DayCap:number;
 steps:{key:string;delayMinutes:number;scenario:SyntheticEmailScenario}[];
};
export type SyntheticJourneyPlan={
 syntheticOnly:true;actualMessagesSent:0;verifiedProviderReceipts:0;
 realProviderRequests:0;externalEffectsAuthorized:false;
 automaticRetryAllowed:false;requiresFreshConsentAtExecution:true;
 timeZone:string;eligibleAtSnapshot:number;
 steps:{key:string;scheduledAt:string;localDay:string;
  scenario:SyntheticEmailScenario;virtualAccepted:number;
  virtualOutcomeUnknown:number;actualMessagesSent:0;
  automaticRetryAllowed:false;virtualRequestRef:string}[];
};
const hhmm=(raw:unknown):number=>{
 if(typeof raw!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(raw))
  throw new Error('Quiet hours must use HH:mm');
 return Number(raw.slice(0,2))*60+Number(raw.slice(3,5));
};
const localParts=(instant:number,formatter:Intl.DateTimeFormat)=>{
 const fields=Object.fromEntries(formatter.formatToParts(new Date(instant))
  .filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const day=fields.year+'-'+fields.month+'-'+fields.day;
 return{day,minute:Number(fields.hour)*60+Number(fields.minute)};
};
const inQuiet=(minute:number,start:number,end:number)=>
 start<end?(minute>=start&&minute<end):(minute>=start||minute<end);
export function parseSyntheticJourney(raw:unknown):SyntheticJourneyDefinition{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new Error('Synthetic journey must be a bounded object');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['timeZone','startAt','quietHours',
  'dailyCap','rolling7DayCap','steps'].includes(k))||
  ['timeZone','startAt','quietHours','dailyCap','rolling7DayCap','steps']
   .some(k=>!Object.hasOwn(v,k)))
  throw new Error('Unknown or missing synthetic journey field');
 if(typeof v.timeZone!=='string'||v.timeZone.length>80)
  throw new Error('IANA time zone required');
 try{new Intl.DateTimeFormat('en-US',{timeZone:v.timeZone}).format(0);}
 catch{throw new Error('Invalid IANA time zone');}
 if(typeof v.startAt!=='string'||
  !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v.startAt)||
  !Number.isFinite(Date.parse(v.startAt)))
  throw new Error('UTC ISO journey startAt required');
 if(!v.quietHours||typeof v.quietHours!=='object'||
  Array.isArray(v.quietHours)||Object.keys(v.quietHours).sort().join(',')!=='end,start')
  throw new Error('Exact quiet hours start/end required');
 const quiet=v.quietHours as Record<string,unknown>;
 if(hhmm(quiet.start)===hhmm(quiet.end))
  throw new Error('Quiet hours must not have equal boundaries');
 if(!Number.isSafeInteger(v.dailyCap)||(v.dailyCap as number)<1||
  (v.dailyCap as number)>3||
  !Number.isSafeInteger(v.rolling7DayCap)||
  (v.rolling7DayCap as number)<1||(v.rolling7DayCap as number)>10)
  throw new Error('Daily and rolling 7-day caps must be bounded');
 if(!Array.isArray(v.steps)||v.steps.length<1||v.steps.length>8)
  throw new Error('Journey must contain 1-8 bounded steps');
 const seen=new Set<string>();
 const steps=v.steps.map((rawStep:unknown)=>{
  if(!rawStep||typeof rawStep!=='object'||Array.isArray(rawStep))
   throw new Error('Invalid journey step');
  const step=rawStep as Record<string,unknown>;
  if(Object.keys(step).sort().join(',')!=='delayMinutes,key,scenario'||
   typeof step.key!=='string'||!/^[a-z][a-z0-9_-]{2,63}$/.test(step.key)||
   seen.has(step.key)||!Number.isSafeInteger(step.delayMinutes)||
   (step.delayMinutes as number)<0||(step.delayMinutes as number)>10080)
   throw new Error('Invalid or duplicate bounded journey step');
  seen.add(step.key);
  return{key:step.key,delayMinutes:step.delayMinutes as number,
   scenario:assertSyntheticEmailScenario(step.scenario)};
 });
 return{timeZone:v.timeZone,startAt:new Date(v.startAt).toISOString(),
  quietHours:{start:quiet.start as string,end:quiet.end as string},
  dailyCap:v.dailyCap as number,rolling7DayCap:v.rolling7DayCap as number,steps};
}
export function syntheticJourneyDigest(definition:SyntheticJourneyDefinition):string{
 const d=parseSyntheticJourney(definition);
 return 'sha256:'+createHash('sha256').update(JSON.stringify([
  'medsol-r2j-synthetic-journey-v1',d
 ])).digest('hex');
}
export function simulateSyntheticJourney(input:{
 organizationId:string;brandId:string;campaignId:string;
 contentDigest:string;audienceDigest:string;eligibleAtSnapshot:number;
 definition:SyntheticJourneyDefinition
}):SyntheticJourneyPlan{
 const d=parseSyntheticJourney(input.definition);
 if(!Number.isSafeInteger(input.eligibleAtSnapshot)||
  input.eligibleAtSnapshot<0||input.eligibleAtSnapshot>100)
  throw new Error('Invalid snapshot eligibility');
 const formatter=new Intl.DateTimeFormat('en-GB',{
  timeZone:d.timeZone,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 });
 const quietStart=hhmm(d.quietHours.start),quietEnd=hhmm(d.quietHours.end);
 const accepted:{at:number;day:string}[]=[];
 const start=Date.parse(d.startAt);
 let previous=start;
 const steps:SyntheticJourneyPlan['steps']=[];
 for(const step of d.steps){
  let candidate=previous+step.delayMinutes*60000;
  // Deterministic 15-minute search, including DST jumps. Hard 14-day
  // per-step horizon; a blocked schedule fails instead of bypassing caps.
  const stop=candidate+14*86400000;
  let slot:{day:string;minute:number}|null=null;
  while(candidate<=stop){
   const local=localParts(candidate,formatter);
   const dayCount=accepted.filter(x=>x.day===local.day).length;
   const weekCount=accepted.filter(x=>x.at>candidate-7*86400000).length;
   if(!inQuiet(local.minute,quietStart,quietEnd)&&
      dayCount<d.dailyCap&&weekCount<d.rolling7DayCap){
    slot=local;break;
   }
   candidate+=15*60000;
  }
  if(!slot||candidate-start>90*86400000)
   throw new Error('Journey cannot meet quiet hours, frequency caps and horizon');
  const stepContentDigest='sha256:'+createHash('sha256').update(JSON.stringify([
   'medsol-r2j-virtual-step-v1',input.contentDigest,step.key
  ])).digest('hex');
  const result=simulateSyntheticEmailTransport({
   organizationId:input.organizationId,brandId:input.brandId,
   campaignId:input.campaignId,contentDigest:stepContentDigest,
   audienceDigest:input.audienceDigest,
   eligibleCount:input.eligibleAtSnapshot,scenario:step.scenario
  });
  steps.push({key:step.key,scheduledAt:new Date(candidate).toISOString(),
   localDay:slot.day,scenario:step.scenario,
   virtualAccepted:result.virtualAccepted,
   virtualOutcomeUnknown:result.virtualOutcomeUnknown,
   actualMessagesSent:0,automaticRetryAllowed:false,
   virtualRequestRef:result.virtualRequestRef});
  accepted.push({at:candidate,day:slot.day});
  previous=candidate;
 }
 return{syntheticOnly:true,actualMessagesSent:0,
  verifiedProviderReceipts:0,realProviderRequests:0,
  externalEffectsAuthorized:false,automaticRetryAllowed:false,
  requiresFreshConsentAtExecution:true,timeZone:d.timeZone,
  eligibleAtSnapshot:input.eligibleAtSnapshot,steps};
}
