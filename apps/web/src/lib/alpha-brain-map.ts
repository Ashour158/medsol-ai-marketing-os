type Agent={id:string;name:string;mission?:string;capabilities?:string[];authority?:string[]};
type Stage={stage:string;agents:string[]};
type Plan={stages:Stage[];handoffs:Record<string,string[]>;controls?:Record<string,boolean>};
export const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
export const strings=(x:unknown):x is string[]=>Array.isArray(x)&&x.every(y=>typeof y==="string");
export function readBrainMap(plan:unknown,roster:unknown){
 if(!record(plan)||!Array.isArray(plan.stages)||!record(plan.handoffs)||!Array.isArray(roster))return null;
 const agents:Agent[]=roster.filter((a):a is Agent=>record(a)&&typeof a.id==="string"&&typeof a.name==="string");
 const byId=new Map(agents.map(a=>[a.id,a]));
 if(!agents.length||agents.length!==byId.size)return null;
 const seen=new Set<string>(),stages:Stage[]=[];
 for(const x of plan.stages){if(!record(x)||typeof x.stage!=="string"||!strings(x.agents)||!x.agents.length)return null;
  for(const id of x.agents){if(!byId.has(id)||seen.has(id))return null;seen.add(id);}
  stages.push({stage:x.stage,agents:x.agents});
 }
 if(seen.size!==agents.length)return null;
 const handoffs:Record<string,string[]>={};
 for(const [id,to] of Object.entries(plan.handoffs)){if(!seen.has(id)||!strings(to)||to.some(t=>!seen.has(t)))return null;handoffs[id]=to;}
 const controls:Record<string,boolean>={};if(record(plan.controls))for(const [key,value] of Object.entries(plan.controls)){if(typeof value==="boolean")controls[key]=value;}
 return {agents,byId,plan:{stages,handoffs,controls} as Plan};
}
