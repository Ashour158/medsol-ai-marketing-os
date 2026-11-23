/**
 * Read-only export of the canonical Blueprint v2.1 target inventory.
 * The registry is planning evidence, NOT live feature detection or certification.
 * No new engine, workflow, approval or tenant data authority is created.
 */
export type GapEntry={id:string;name:string;owner:string;release:string;state:string;
 blocker?:string;goal?:string};
export type GapInventory={version:string;targetStateOnly:boolean;
 counts:Record<string,number>;engines:GapEntry[];workflows:GapEntry[]};
export const GAP_STATES=['NOT_IMPLEMENTED','DRAFT_ONLY','PARTIAL','VERIFIED_IMPLEMENTED'] as const;
export function validateGapInventory(input:GapInventory){
 if(input?.version!=='2.1'||input.targetStateOnly!==true||
  input.counts?.engines!==36||input.counts?.workflows!==41||
  input.engines?.length!==36||input.workflows?.length!==41)
  throw Error('Blueprint inventory must contain the canonical 36 engines and 41 workflows');
 const seen=new Set<string>();
 for(const [prefix,items] of [['E',input.engines],['WF',input.workflows]] as const){
  for(let i=0;i<items.length;i++){
   const x=items[i],id=prefix+String(i+1).padStart(2,'0');
   if(!x||x.id!==id||seen.has(x.id)||
    !x.name||!x.owner||!/^R[0-5]$/.test(x.release)||
    !GAP_STATES.includes(x.state as typeof GAP_STATES[number])||
    (x.blocker!==undefined&&typeof x.blocker!=='string'))
    throw Error('Invalid or reordered blueprint capability '+id);
   seen.add(x.id);
  }
 }
 return input;
}
const safe=(value:unknown)=>{
 const s=String(value??'').replace(/\r?\n/g,' ');
 const neutral=/^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s;
 return '"'+neutral.replaceAll('"','""')+'"';
};
export function gapInventoryCsv(input:GapInventory){
 const inventory=validateGapInventory(input);
 const rows:(string|number)[][]=[
  ['kind','id','name','owner','release','registry_state','target_goal','recorded_blocker','acceptance','evidence_limit'],
  ...inventory.engines.map(x=>['ENGINE',x.id,x.name,x.owner,x.release,x.state,x.goal??'',
   x.blocker??'','INDEPENDENT_VALIDATION_PENDING','TARGET_REGISTER_NOT_RUNTIME_PROOF']),
  ...inventory.workflows.map(x=>['WORKFLOW',x.id,x.name,x.owner,x.release,x.state,x.goal??'',
   x.blocker??'','INDEPENDENT_VALIDATION_PENDING','TARGET_REGISTER_NOT_RUNTIME_PROOF'])
 ];
 rows.push(['RELEASE','ALL','','','','NOT_CERTIFIED','','','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']);
 return rows.map(r=>r.map(safe).join(',')).join('\r\n')+'\r\n';
}
export function gapCounts(input:GapInventory){
 const {engines,workflows}=validateGapInventory(input);
 return {total:77,engines:36,workflows:41,
  byState:Object.fromEntries(GAP_STATES.map(s=>[s,[...engines,...workflows]
   .filter(x=>x.state===s).length])) as Record<string,number>};
}
