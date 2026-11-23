/** Browser-only export of a previously verified, CURRENT DAM revision.
 * The DAM and exact creative approval remain the only source authorities.
 * A flattened PNG is never called an editable layered design.
 */
export type OfflineCreativeRecord={
 assetId:string;revisionId:string;version:number;brandId:string;
 renditionDigest:string;offlineOnly:true;sourceKind:'FLATTENED_EXPORT';
};
export type OfflineCreativePreview={
 assetId:string;revisionId:string;version:number;current:boolean;
 editableCopy:string;imageDataUrl:string;renditionDigest:string;
 offlineOnly:true;
};
export function validateOfflineCreativeDownload(
 creative:OfflineCreativeRecord,preview:OfflineCreativePreview){
 if(!creative||!preview||creative.offlineOnly!==true||
  preview.offlineOnly!==true||creative.sourceKind!=='FLATTENED_EXPORT'||
  creative.assetId!==preview.assetId||creative.revisionId!==preview.revisionId||
  creative.version!==preview.version||preview.current!==true||
  !/^[A-Za-z0-9_-]{8,128}$/.test(creative.revisionId)||
  !Number.isSafeInteger(creative.version)||creative.version<1||
  !/^sha256:[a-f0-9]{64}$/.test(creative.renditionDigest)||
  creative.renditionDigest!==preview.renditionDigest||
  typeof preview.editableCopy!=='string'||preview.editableCopy.length<12||
  preview.editableCopy.length>10000||
  typeof preview.imageDataUrl!=='string'||
  preview.imageDataUrl.length>12_000_000||
  !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(preview.imageDataUrl))
  throw Error('Creative export requires verified current offline raster and exact digest');
 return{pngFilename:'medsol-offline-creative-'+creative.revisionId+'.png',
  copyFilename:'medsol-offline-creative-'+creative.revisionId+'.txt',
  pngDataUrl:preview.imageDataUrl,
  editableCopy:preview.editableCopy,
  version:creative.version,
  layeredEditableDesign:false as const,externalEffectsAuthorized:false as const};
}
