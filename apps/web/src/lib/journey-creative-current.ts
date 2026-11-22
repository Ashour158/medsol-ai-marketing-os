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
 const current=observed.filter(x=>x.assetId===selected.assetId&&x.current===true);
 // Fail closed on ambiguous or missing canonical current-version evidence.
 return current.length===1&&current[0]!.revisionId===selected.revisionId&&
  current[0]!.brandId===selected.brandId;
}
