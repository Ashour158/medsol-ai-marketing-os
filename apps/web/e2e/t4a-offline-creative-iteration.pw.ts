import {test,expect,type Page} from "@playwright/test";
import {randomUUID} from "node:crypto";
/** Real browser and compiled API: never self-claims media or approval rights.
 * This exercises user-facing edits, immutable DAM revisions and tenant access.
 */
const ctl="http://127.0.0.1:3216",brand="r3y-stage-brand";
type Persona="admin"|"viewer"|"foreign";
async function login(page:Page,who:Persona){
 const selected=await page.request.post(ctl+"/__select-persona?persona="+who);
 expect(selected.status()).toBe(200);
 await page.goto("/api/auth/login");
 await page.getByRole("button",{name:"Load authenticated workspace"}).click();
 await expect(page.getByText("Signed in as t1e-stage-"+who+"@example.invalid"))
  .toBeVisible();
}
async function change(page:Page,who:Persona){
 await page.getByRole("button",{name:"Sign out"}).click();
 await expect(page.getByText("Signed in as")).toHaveCount(0);
 await login(page,who);
}
async function api(page:Page,path:string,body?:unknown){
 return page.evaluate(async({path,body,post})=>{
  const res=await fetch("/api/marketing/"+path,{method:post?"POST":"GET",
   credentials:"same-origin",cache:"no-store",
   ...(post?{headers:{"content-type":"application/json"},
    body:JSON.stringify(body)}:{})});
  let data:unknown;try{data=await res.json()}catch{data=null}
  return{status:res.status,data};
 },{path,body,post:body!==undefined});
}
async function ok(page:Page,path:string,body?:unknown):Promise<any>{
 const r=await api(page,path,body);
 expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(200);
 expect(r.status,JSON.stringify(r.data)).toBeLessThan(300);
 return r.data;
}
async function openEditor(page:Page){
 await page.locator("summary").filter({hasText:"Integrated Campaign Journey"}).click();
 await page.getByRole("combobox",{name:"Brand",exact:true}).selectOption(brand);
}
async function createCreative(page:Page){
 const title="T4A reviewed creative "+randomUUID().slice(0,12);
 await page.getByRole("textbox",{name:"Creative headline"}).fill(title);
 await page.getByRole("button",{name:"Generate and verify internal flattened raster draft"}).click();
 await expect(page.getByRole("status").filter({hasText:"Stored actual synthetic PNG"}))
  .toBeVisible();
 const assets=await ok(page,"assets") as Array<{id:string;title:string;version:number}>;
 const row=assets.find(x=>x.title===title);
 expect(row).toBeDefined();expect(row!.version).toBe(1);
 return row!.id;
}
test("T20-001 creative editor saves version 2 on same asset, readbacks both PNGs and compares historical copy",async({page})=>{
 await login(page,"admin");await openEditor(page);
 const assetId=await createCreative(page);
 const first=await ok(page,"assets/"+assetId);
 expect(first.revisions).toHaveLength(1);
 const oldId=first.revisions[0].id as string;
 const previous=await ok(page,"assets/revisions/"+oldId+"/offline-preview");
 expect(previous.current).toBe(true);
 await page.getByRole("textbox",{name:"Campaign copy (editable separate from flattened raster)"})
  .fill("Updated research design for evidence-led molecular biology campaigns with human review and traceable claims.");
 await page.getByRole("textbox",{name:"Accent color"}).fill("#5b21b6");
 await page.getByRole("button",{name:"Save revised PNG and text as new version"}).click();
 await expect(page.getByRole("status").filter({hasText:"Saved immutable version 2"}))
  .toBeVisible();
 const revised=await ok(page,"assets/"+assetId);
 expect(revised.version).toBe(2);
 expect(revised.revisions.map((x:{version:number})=>x.version)).toEqual([2,1]);
 expect(revised.revisions.every((x:{offlinePreviewAvailable:boolean})=>x.offlinePreviewAvailable))
  .toBe(true);
 const newId=revised.revisions[0].id as string;
 const next=await ok(page,"assets/revisions/"+newId+"/offline-preview");
 const old=await ok(page,"assets/revisions/"+oldId+"/offline-preview");
 expect(old.current).toBe(false);expect(next.current).toBe(true);
 expect(old.renditionDigest).not.toBe(next.renditionDigest);
 expect(next.editableCopy).toContain("Updated research design");
 const evidence=await ok(page,"media/evidence/"+newId);
 expect(evidence).toMatchObject({evidenceOrigin:"OFFLINE_DB_RASTER",
  remotePlatformMediaEligible:false,externalEffectsAuthorized:false});
 const download=page.waitForEvent("download");
 await page.getByRole("button",{name:"Export new editable SVG draft (unapproved)"}).click();
 expect((await download).suggestedFilename()).toBe("medsol-derived-unapproved-"+newId+".svg");
 await expect(page.getByRole("status").filter({hasText:"no inherited approval or rights"})).toBeVisible();
 expect((await ok(page,"assets/"+assetId)).version).toBe(2);
 await page.getByRole("combobox",{name:"Version history (read-only comparisons)"})
  .selectOption(oldId);
 await page.getByRole("button",{name:"Compare saved version"}).click();
 await expect(page.getByRole("img",{name:"Previously saved offline creative version"}))
  .toHaveAttribute("src",/^data:image\/png;base64,/);
 await page.getByRole("button",{name:"Reuse historical copy in editor"}).click();
 await expect(page.getByRole("textbox",{
  name:"Campaign copy (editable separate from flattened raster)"})).not.toBeEmpty();
 const stale=await api(page,"assets/"+assetId+"/offline-revisions",{
  expectedVersion:1,editableCopy:next.editableCopy,
  pngBase64:next.imageDataUrl.split(",")[1],
  rightsExpiresAt:new Date(Date.now()+60*86400_000).toISOString(),
  requestKey:randomUUID()
 });
 expect(stale.status).toBe(409);
 expect((await ok(page,"assets/"+assetId)).version).toBe(2);
 const layered=page.getByRole("region",{name:"Persistent editable design source"});
 await layered.getByLabel("Layered design asset ID").fill(assetId);
 await layered.getByRole("button",{name:"Load editable design asset"}).click();
 await layered.getByLabel("Draft locale").selectOption("ar-EG");
 await layered.getByLabel("Layered design headline").fill("البحث والابتكار");
 await layered.getByLabel("Layered body copy").fill("مسودة عربية للمراجعة العلمية");
 await expect(layered.getByLabel("Layered design headline")).toHaveAttribute("dir","rtl");
 await layered.getByLabel("Layered canvas").selectOption("PORTRAIT");
 await layered.getByRole("button",{name:"Save layered design as new unapproved version"}).click();
 await expect(layered.getByRole("status")).toContainText("Saved immutable editable design revision 3");
 await expect(layered.getByRole("img",{name:"Stored deterministic editable design preview; unapproved"}))
  .toHaveAttribute("src",/^data:image\/svg\+xml;base64,/);
 const v3=await ok(page,"assets/"+assetId);
 expect(v3.version).toBe(3);expect(v3.revisions[0]).toMatchObject({layeredPreviewAvailable:true,offlineLayeredParentRevisionId:newId});
 const layeredId=v3.revisions[0].id as string;
 const stored=await ok(page,"assets/revisions/"+layeredId+"/layered-preview");
 expect(stored).toMatchObject({parentRevisionId:newId,releaseAuthorized:false,current:true,spec:{locale:'ar-EG',title:'البحث والابتكار'}});
 expect(Buffer.from(stored.svgDataUrl.split(',')[1],'base64').toString('utf8')).toContain('direction="rtl"');
 const exportPromise=page.waitForEvent("download");
 await layered.getByRole("button",{name:"Download stored editable SVG"}).click();
 expect((await exportPromise).suggestedFilename()).toBe("medsol-layered-unapproved-"+layeredId+".svg");
 await layered.getByRole("button",{name:"Render offline PNG candidate"}).click();
 await expect(layered.getByRole("status")).toContainText("Offline PNG candidate saved");
 const v4=await ok(page,"assets/"+assetId);
 expect(v4.version).toBe(4);
 const rendered=v4.revisions[0];
 expect(rendered).toMatchObject({version:4,offlinePreviewAvailable:true,offlineRenditionParentRevisionId:layeredId,offlineRenditionSourceDigest:stored.sourceDigest,rightsReviewedAt:null});
 const candidate=await ok(page,"assets/revisions/"+rendered.id+"/offline-preview");
 expect(candidate.current).toBe(true);
 expect(candidate.editableCopy).toBe("البحث والابتكار\nمسودة عربية للمراجعة العلمية");
 const png=Buffer.from(candidate.imageDataUrl.split(",")[1],"base64");
 expect(png.readUInt32BE(16)).toBe(1080);expect(png.readUInt32BE(20)).toBe(1350);
 expect(candidate.renditionDigest).toBe(rendered.renditionDigest);
 expect((await ok(page,"assets/revisions/"+layeredId+"/layered-preview")).current).toBe(false);
 // The browser author cannot attest to their own rendition, even with exact hashes.
 const comparison={parentRevisionId:layeredId,sourceDigest:stored.sourceDigest,renditionDigest:candidate.renditionDigest,visuallyCompared:true};
 const verify=await ok(page,"media/evidence/"+rendered.id+"/verify-offline",{});
 expect(verify).toMatchObject({status:"VERIFIED_READBACK",evidenceOrigin:"OFFLINE_DB_RASTER",sha256Digest:candidate.renditionDigest,externalEffectsAuthorized:false});
 // Eligibility is a read-model field; verify it from the authoritative GET.
 const verified=await ok(page,"media/evidence/"+rendered.id);
 expect(verified).toMatchObject({evidenceOrigin:"OFFLINE_DB_RASTER",remotePlatformMediaEligible:false,externalEffectsAuthorized:false});
 const replay=await ok(page,"media/evidence/"+rendered.id+"/verify-offline",{});
 expect(replay).toMatchObject({evidenceId:verify.evidenceId,status:"VERIFIED_READBACK",replayed:true,externalEffectsAuthorized:false});
 const deniedReview=await api(page,"assets/revisions/"+rendered.id+"/rights-review",{reason:"Attempted self comparison review of authored rendition",comparison});
 expect(deniedReview.status).toBe(403);
 expect((await ok(page,"assets/"+assetId)).revisions[0].rightsReviewedAt).toBeNull();


});
test("T20-002 same-tenant viewer cannot revise; signed foreign tenant cannot retrieve other brand creative",async({page})=>{
 await login(page,"admin");await openEditor(page);
 const assetId=await createCreative(page);
 await change(page,"viewer");
 expect((await ok(page,"assets/"+assetId)).version).toBe(1);
 const denied=await api(page,"assets/"+assetId+"/offline-revisions",{
  expectedVersion:1,editableCopy:"Unauthorized external version attempt",
  pngBase64:"invalid",rightsExpiresAt:"2027-12-01T00:00:00.000Z",
  requestKey:randomUUID()
 });
 expect(denied.status).toBe(403);
 await change(page,"foreign");
 const missing=await api(page,"assets/"+assetId);
 expect(missing.status).toBeGreaterThanOrEqual(400);
 expect((await ok(page,"assets") as Array<{id:string}>)
  .some(x=>x.id===assetId)).toBe(false);
});
