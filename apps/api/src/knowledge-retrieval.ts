import {createHash} from 'node:crypto';
import {BadRequestException} from '@nestjs/common';

/** Deterministic LOCAL sparse vectors, not model embeddings or scientific inference.
 * Never send content or metadata to external providers in R3-H.
 */
export const KNOWLEDGE_VECTOR_DIMENSIONS=96;
const scrub=(raw:string)=>raw.replace(/\u0000/g,'').replace(/\r\n?/g,'\n').trim();
export function knowledgeText(raw:unknown,max=24000):string{
 if(typeof raw!=='string')throw new BadRequestException('Knowledge text required');
 const text=scrub(raw);
 if(text.length<40||text.length>max||/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(text))
  throw new BadRequestException('Knowledge content must be printable, bounded and substantive');
 return text;
}
export function knowledgeTerms(raw:string):string[]{
 const terms=(raw.toLowerCase().match(/[a-z0-9\u00c0-\u024f]{3,40}/gu)??[]);
 return [...new Set(terms)].sort().slice(0,500);
}
export function sparseKnowledgeVector(raw:string):number[]{
 const terms=raw.toLowerCase().match(/[a-z0-9\u00c0-\u024f]{3,40}/gu)??[];
 const freq=new Map<string,number>();
 for(const term of terms.slice(0,5000))freq.set(term,(freq.get(term)??0)+1);
 const bins=Array<number>(KNOWLEDGE_VECTOR_DIMENSIONS).fill(0);
 for(const [term,count] of freq){
  const digest=createHash('sha256').update(term).digest();
  const index=digest.readUInt16BE(0)%KNOWLEDGE_VECTOR_DIMENSIONS;
  const sign=(digest[2]!&1)?1:-1;
  bins[index]=bins[index]!+sign*(1+Math.log(count));
 }
 const norm=Math.sqrt(bins.reduce((n,v)=>n+v*v,0));
 return bins.map(v=>norm?v/norm:0);
}
export function knowledgeCosine(a:readonly number[],b:readonly number[]){
 if(a.length!==KNOWLEDGE_VECTOR_DIMENSIONS||b.length!==KNOWLEDGE_VECTOR_DIMENSIONS||
  a.some(x=>!Number.isFinite(x))||b.some(x=>!Number.isFinite(x)))return 0;
 return Math.max(0,a.reduce((sum,x,i)=>sum+x*(b[i]??0),0));
}
export type DraftKnowledgeChunk={ordinal:number;content:string;digest:string;
 terms:string[];vector:number[]};
export function chunkKnowledge(raw:unknown):DraftKnowledgeChunk[]{
 const text=knowledgeText(raw);
 const words=text.match(/\S+\s*/g)??[];
 const chunks:string[]=[];
 let current='';
 for(const word of words){
  if(word.length>860)throw new BadRequestException('Oversize uninterrupted knowledge token');
  if(current.length&&current.length+word.length>860){
   chunks.push(current.trim());
   const overlap=current.trim().split(/\s+/).slice(-12).join(' ');
   current=(overlap?overlap+' ':'')+word;
  }else current+=word;
 }
 if(current.trim())chunks.push(current.trim());
 if(chunks.length>40)throw new BadRequestException('Knowledge document exceeds 40 bounded chunks');
 return chunks.map((content,ordinal)=>({ordinal,content,
  digest:'sha256:'+createHash('sha256').update(content).digest('hex'),
  terms:knowledgeTerms(content),vector:sparseKnowledgeVector(content)}));
}
export function evidenceScore(params:{textRank:number;cosine:number;
 publishedAt:Date|null;now?:number}):number{
 const age=params.publishedAt?
  Math.max(0,((params.now??Date.now())-params.publishedAt.getTime())/86400000):365;
 const freshness=0.70+0.30*Math.exp(-age/180);
 return Number((freshness*(0.62*Math.max(0,params.textRank)+
  0.38*knowledgeCosineNormalized(params.cosine))).toFixed(6));
}
function knowledgeCosineNormalized(v:number){return Math.min(1,Math.max(0,v))}
export function knowledgeSourceDigest(raw:string){
 return 'sha256:'+createHash('sha256').update(raw).digest('hex');
}
