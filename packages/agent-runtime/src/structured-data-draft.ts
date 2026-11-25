/** Adapted from meshpilot-hq/ai-seo-agent, MIT.
 * Original files: app/agent/generators/organization.ts (blob 4d73428f467928dedf945d923a9fc70778b92fdb),
 * app/agent/generators/breadcrumb.ts (blob b729854d8f5b345a0761e7c6cd949183c32c961c).
 * Modifications: isolate pure helpers, remove email, prevent stock SEO claims,
 * constrain input, validate tenant and HTTPS, return JSON data only.
 * The original license notice follows verbatim.
 *
 * MIT License
 * 
 * Copyright (c) 2026 ai-seo-agent contributors
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */
type ClientMemory={brandName?:string;tagline?:string;sameAs?:string[]};
type EditProposal={rationale?:string;productHandle?:string};
type PageEdit={kind:"jsonld";scope:"shop"|"product";productHandle?:string;
 schema:Record<string,unknown>;rationale:string};

/**
 * Organization JSON-LD — deterministic. Merges platform-fetched shop
 * data with ClientMemory-provided brand facts (tagline, sameAs, etc).
 */

function generateOrganizationSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): PageEdit {
  const shop = ctx as {
    name?: string;
    url?: string;
    logoUrl?: string;
    description?: string;
  };

  const sameAs = new Set<string>();
  if (cm?.sameAs) cm.sameAs.forEach((s) => s && sameAs.add(s));

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: cm?.brandName || shop.name || "",
    url: shop.url ?? "",
  };
  if (shop.logoUrl) schema.logo = shop.logoUrl;
  const description = cm?.tagline || shop.description;
  if (description) schema.description = description;
  if (sameAs.size > 0) schema.sameAs = [...sameAs];

  return {
    kind: "jsonld",
    scope: "shop",
    schema,
    rationale: proposal.rationale || "Organization metadata draft; visibility not verified.",
  };
}


function generateBreadcrumbSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): PageEdit {
  const p = ctx as {
    title?: string;
    url?: string;
    collectionTitle?: string;
    collectionUrl?: string;
    shopUrl?: string;
    shopName?: string;
    handle?: string;
  };

  const homeLabel = cm?.brandName || p.shopName || "Home";

  const items: Record<string, unknown>[] = [];
  let pos = 1;
  if (p.shopUrl) {
    items.push({ "@type": "ListItem", position: pos++, name: homeLabel, item: p.shopUrl });
  }
  if (p.collectionTitle && p.collectionUrl) {
    items.push({ "@type": "ListItem", position: pos++, name: p.collectionTitle, item: p.collectionUrl });
  }
  if (p.title && p.url) {
    items.push({ "@type": "ListItem", position: pos++, name: p.title, item: p.url });
  }

  return {
    kind: "jsonld",
    scope: "product",
    productHandle: proposal.productHandle ?? p.handle,
    schema: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items,
    },
    rationale: proposal.rationale || "Breadcrumb metadata draft; search appearance not verified.",
  };
}

type RecordInput=Record<string,unknown>;
function record(value:unknown):RecordInput{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Structured-data draft object required");
 return value as RecordInput;
}
function only(value:RecordInput,keys:readonly string[]){
 if(Object.keys(value).some(k=>!keys.includes(k)))throw Error("Unsupported structured-data field");
}
function plain(value:unknown,max:number){
 if(typeof value!=="string"||!value.trim()||value.length>max||/[<>\u0000-\u001f\u007f]/.test(value))
  throw Error("Bounded plain text required for structured data");
 return value.trim();
}
function https(value:unknown){
 const raw=plain(value,500);
 let url:URL;try{url=new URL(raw)}catch{throw Error("Valid HTTPS metadata URL required")}
 if(url.protocol!=="https:"||url.username||url.password||url.hash||url.search||
  url.port||url.hostname==="localhost"||!url.hostname.includes(".")||
  /^\d+(?:\.\d+){3}$/.test(url.hostname)||url.hostname.endsWith(".local"))
  throw Error("Public HTTPS metadata URL without credentials, query or fragment required");
 return url.href;
}
/** No network fetch, no provider write, no inferred claim. Caller-supplied
 * evidence is a draft input, not proof that identity or ownership was verified. */
export function draftReviewedStructuredData(organizationId:string,brandId:string,raw:unknown){
 const input=record(raw);
 only(input,["organizationId","brandId","sourceReference","sourceReviewed","collectionPermitted",
  "organizationName","websiteUrl","logoUrl","description","sameAs","breadcrumb"]);
 if(!organizationId||input.organizationId!==organizationId||!brandId||input.brandId!==brandId)
  throw Error("Cross-tenant or brand structured-data draft prohibited");
 if(input.sourceReviewed!==true||input.collectionPermitted!==true)
  throw Error("Reviewed and permitted source input required");
 const sourceReference=plain(input.sourceReference,500);
 if(!sourceReference.startsWith("internal:")||!/^internal:[A-Za-z0-9_:/.-]+$/.test(sourceReference))
  throw Error("Internal evidence reference required");
 const name=plain(input.organizationName,180),url=https(input.websiteUrl);
 const description=input.description===undefined?undefined:plain(input.description,1000);
 const logoUrl=input.logoUrl===undefined?undefined:https(input.logoUrl);
 const sameAs=input.sameAs===undefined?[]:input.sameAs;
 if(!Array.isArray(sameAs)||sameAs.length>10)throw Error("At most ten identity links");
 const schemas=[generateOrganizationSchema({}, {name,url,logoUrl,description},
  {brandName:name,sameAs:sameAs.map(https)}).schema];
 if(input.breadcrumb!==undefined){
  const page=record(input.breadcrumb);
  only(page,["title","url","collectionTitle","collectionUrl"]);
  const pageUrl=https(page.url),title=plain(page.title,180);
  const hasCollection=page.collectionTitle!==undefined||page.collectionUrl!==undefined;
  const collectionTitle=hasCollection?plain(page.collectionTitle,180):undefined;
  const collectionUrl=hasCollection?https(page.collectionUrl):undefined;
  if(new URL(pageUrl).origin!==new URL(url).origin||
   (collectionUrl!==undefined&&new URL(collectionUrl).origin!==new URL(url).origin)||
   pageUrl===url||collectionUrl===url||collectionUrl===pageUrl)
   throw Error("Breadcrumb must identify distinct pages on the same site");
  schemas.push(generateBreadcrumbSchema({}, {title,url:pageUrl,collectionTitle,collectionUrl,
   shopUrl:url,shopName:name},null).schema);
 }
 return{schemas,sourceReference,sourceReviewClaimed:true as const,
  humanApprovalRequired:true as const,independentlyVerified:false as const,
  websiteOwnershipVerified:false as const,searchVisibilityVerified:false as const,
  publicationAuthorized:false as const,externalEffectsAuthorized:false as const};
}
