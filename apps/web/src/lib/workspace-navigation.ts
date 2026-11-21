export type WorkspaceLink={id:string;label:string;category:'Execute'|'Intelligence'|'Govern'|'Operate'};
export const WORKSPACE_LINKS:readonly WorkspaceLink[]=[
 {id:'identity',label:'Sign in & organization',category:'Govern'},
 {id:'portfolio',label:'Portfolio & objectives',category:'Operate'},
 {id:'journey',label:'Campaign journey',category:'Execute'},
 {id:'strategy',label:'Strategy & campaign intake',category:'Intelligence'},
 {id:'creative',label:'Creative governance',category:'Execute'},
 {id:'social',label:'Social publishing sandbox',category:'Execute'},
 {id:'email',label:'Synthetic email',category:'Execute'},
 {id:'approvals',label:'Human approvals',category:'Govern'},
 {id:'operations',label:'Operations & incidents',category:'Operate'},
 {id:'agent-brain',label:'Agent brain & plans',category:'Intelligence'},
 {id:'workflow-studio',label:'Workflow Studio',category:'Execute'},
 {id:'blueprint-studio',label:'Blueprint Studio',category:'Execute'},
 {id:'knowledge',label:'Knowledge Fabric',category:'Intelligence'},
 {id:'memory',label:'Governed memory',category:'Intelligence'},
 {id:'tool-registry',label:'MCP & A2A tool registry',category:'Govern'},
 {id:'provider-trials',label:'Provider contract trials',category:'Govern'},
 {id:'integrations',label:'Integration governance',category:'Govern'},
 {id:'acceptance',label:'Release acceptance',category:'Operate'}
] as const;

export function filterWorkspaceLinks(search:string,items:readonly WorkspaceLink[]=WORKSPACE_LINKS){
 const query=search.trim().toLocaleLowerCase('en');
 if(query.length>100)return[];
 return query?items.filter(x=>(x.label+' '+x.category).toLocaleLowerCase('en').includes(query)):items;
}
