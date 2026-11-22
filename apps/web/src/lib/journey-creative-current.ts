/**
 * Read-model-only guard for the campaign journey UI. It prevents the operator
 * from acting on a stale selected version. Actual authorization, approval
 * scope and CAS still belong exclusively to the canonical API services.
 */
export type ObservedCreativeRevision={
 assetId:string;revisionId:string;brandId:string;current:boolean;
};
export type SelectedCreativeRevision={
 assetId:string;revisionId:string;brandId:string;
};
export function selectedCreativeIsCurrent(
 observed:readonly ObservedCreativeRevision[],
 selected:SelectedCreativeRevision|null
):boolean{
 if(!selected?.assetId||!selected.revisionId||!selected.brandId)return false;
 const versions=observed.filter(x=>x.assetId===selected.assetId);
 if(!versions.length||versions.some(x=>x.brandId!==selected.brandId)||
    new Set(versions.map(x=>x.revisionId)).size!==versions.length)
  return false;
 const current=versions.filter(x=>x.current===true);
 // Fail closed on ambiguous, cross-brand or missing current-version evidence.
 return current.length===1&&current[0]!.revisionId===selected.revisionId;
}
