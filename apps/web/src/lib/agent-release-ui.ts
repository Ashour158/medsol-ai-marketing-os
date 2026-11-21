export type ReleaseRowView={
 id:string;agentId:string;status:string;createdBy:string;signatureTrusted:boolean;
};
export type ActorView={userId:string;role:string}|null;
export function releasePermissions(row:ReleaseRowView,actor:ActorView){
 const admin=!!actor&&['ADMIN','SUPER_ADMIN'].includes(actor.role.toUpperCase());
 const active=row.status!=='REVOKED';
 return{
  approve:!!admin&&row.status==='PROPOSED'&&row.signatureTrusted&&
   row.createdBy!==actor!.userId,
  activate:!!admin&&row.status==='APPROVED'&&row.signatureTrusted,
  revoke:!!admin&&active
 };
}
