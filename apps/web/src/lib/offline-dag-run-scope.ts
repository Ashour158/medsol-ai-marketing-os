/**
 * Client-only idempotency UX: a request key must not be silently reused when
 * the selected signed deployment or business inputs change. The canonical
 * WorkflowExecution ledger still owns server-side idempotency and pinning.
 */
export type OfflineDagRunScope={
 blueprintId:string;activeReleaseId:string;objective:string;market:string;
};
export function offlineDagRunScope(s:OfflineDagRunScope):string{
 // Array form has fixed field order and cannot collide through separators.
 return JSON.stringify([s.blueprintId,s.activeReleaseId,s.objective,s.market]);
}
export function mayReuseOfflineDagRequestKey(
 key:string,issuedForScope:string,currentScope:string
):boolean{
 return key.trim().length>0&&issuedForScope.length>0&&issuedForScope===currentScope;
}
