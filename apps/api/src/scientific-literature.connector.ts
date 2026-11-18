import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MarketingLearningService } from './marketing-learning.service.js';

type LiteratureRecord={id?:string;source?:string;title?:string;authorString?:string;firstPublicationDate?:string;abstractText?:string;journalTitle?:string};
const ENDPOINT='https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const ACCEPTED_SECTORS=new Set(['genomics','sequencing','molecular diagnostics','proteomics','cell therapy','precision medicine','biotechnology','digital pathology','pathology','clinical research','biobanking']);

/**
 * Explicitly bounded lexical ordering of already retrieved Europe PMC metadata.
 * This is NOT RAG, semantic relevance, study-quality scoring, or evidence verification.
 * Stable ties preserve the provider order; nobody can inject a new destination.
 */
export function rankLiteratureMetadata<T extends {title?:string;abstractText?:string}>(query:string,rows:readonly T[]):T[] {
 const terms=[...new Set(query.normalize('NFKC').toLowerCase().split(/[^\\p{L}\\p{N}]+/u).filter(t=>t.length>=3))].slice(0,20);
 const words=(value:unknown):Set<string>=>new Set(typeof value==='string'?
  value.normalize('NFKC').toLowerCase().split(/[^\\p{L}\\p{N}]+/u).filter(Boolean):[]);
 const scored=rows.map((row,index)=>{
  const title=words(row.title),abstract=words(row.abstractText);
  const score=terms.reduce((total,term)=>total+(title.has(term)?5:0)+(abstract.has(term)?1:0),0);
  return{row,index,score};
 });
 return scored.sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.row);
}

/**
 * One deliberately narrow connector: Europe PMC read-only public metadata.
 * No supplied URL is fetched, no external instructions are executed, and the unverified
 * literature record always enters the existing QUARANTINED evidence owner.
 */
@Injectable()
export class ScientificLiteratureConnector {
 constructor(private readonly learning:MarketingLearningService){}
 async discover(organizationId:string,raw:{query?:string;sector?:string;maxResults?:number}){
  const query=raw?.query?.trim(),sector=raw?.sector?.trim().toLowerCase();
  if(!query||query.length>160||!/^[\p{L}\p{N} _+\-().,/]+$/u.test(query))throw new BadRequestException('Invalid literature search query');
  if(!sector||!ACCEPTED_SECTORS.has(sector))throw new BadRequestException('Unsupported literature sector');
  const limit=raw.maxResults??5;
  if(!Number.isInteger(limit)||limit<1||limit>10)throw new BadRequestException('Limit must be between 1 and 10');
  const url=new URL(ENDPOINT);
  url.searchParams.set('query',query);
  url.searchParams.set('format','json');
  url.searchParams.set('pageSize',String(limit));
  url.searchParams.set('resultType','core');
  let response:Response;
  try{
   response=await fetch(url,{redirect:'error',headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
  }catch{throw new ServiceUnavailableException('Scientific literature provider unreachable');}
  if(!response.ok||!response.headers.get('content-type')?.includes('json'))throw new ServiceUnavailableException('Unexpected literature provider response');
  const body=await response.text();
  if(body.length>900000)throw new ServiceUnavailableException('Literature result exceeds size limit');
  let parsed:unknown;
  try{parsed=JSON.parse(body)}catch{throw new ServiceUnavailableException('Malformed literature provider response');}
  const results=(parsed as {resultList?:{result?:LiteratureRecord[]}})?.resultList?.result;
  if(!Array.isArray(results))throw new ServiceUnavailableException('Literature results unavailable');
  const saved:{id:string;replayed:boolean;title:string}[]=[];
  for(const article of rankLiteratureMetadata(query,results.slice(0,limit))){
   const id=typeof article.id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(article.id)?article.id:null;
   const title=typeof article.title==='string'?article.title.trim().slice(0,300):'';
   const source=article.source==='PMC'?'PMC':article.source==='MED'?'MED':null;
   if(!id||!title||!source)continue;
   const published=article.firstPublicationDate&&/^\d{4}-\d{2}-\d{2}$/.test(article.firstPublicationDate)?article.firstPublicationDate:undefined;
   const summary=[article.journalTitle,article.authorString,article.abstractText].filter(x=>typeof x==='string'&&x.trim()).join(' | ').slice(0,3000)||'Publication metadata only; abstract unavailable';
   const data=await this.learning.ingest(organizationId,{
    topic:query,sector,sourceUrl:'https://europepmc.org/article/'+source+'/'+encodeURIComponent(id),
    sourceTitle:title,observedAt:new Date().toISOString(),...(published?{sourcePublishedAt:published}:{}),
    evidence:{summary}
   });
   saved.push({id:data.signal.id,replayed:data.replayed,title});
  }
  return {provider:'EUROPE_PMC',query,sector,count:saved.length,signals:saved,
   verification:'UNVERIFIED_PROVIDER_METADATA',status:'QUARANTINED',publicationAuthorized:false};
 }
}
