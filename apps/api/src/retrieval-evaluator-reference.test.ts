import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it,vi,afterEach} from 'vitest';
import {rankLiteratureMetadata,ScientificLiteratureConnector} from './scientific-literature.connector.js';
type Candidate={id:string;title:string;abstractText:string;relevance:number};
type Scenario={id:string;query:string;candidates:Candidate[];expectedRanking:string[];minNdcgAt3:number};
const corpus=JSON.parse(readFileSync(resolve(process.cwd(),'src/fixtures/retrieval-evaluator-reference-set.json'),'utf8')) as
 {schemaVersion:number;cases:Scenario[]};
function dcg(scores:number[]):number {
 return scores.reduce((sum,r,index)=>sum+(Math.pow(2,r)-1)/Math.log2(index+2),0);
}
afterEach(()=>vi.unstubAllGlobals());
describe('Europe PMC metadata retrieval comparison (no vector RAG or clinical validation)',()=>{
 it('defines fixed ranking expectations for original metadata only',()=>{
  expect(corpus.schemaVersion).toBe(1);
  expect(corpus.cases.length).toBeGreaterThanOrEqual(5);
  expect(new Set(corpus.cases.map(x=>x.id)).size).toBe(corpus.cases.length);
 });
 for(const c of corpus.cases){
  it(c.id,()=>{
   const ranked=rankLiteratureMetadata(c.query,c.candidates);
   expect(ranked.map(x=>x.id)).toEqual(c.expectedRanking);
   // Reference labels are synthetic relevance judgments; no source is scientifically verified.
   const observed=dcg(ranked.slice(0,3).map(x=>x.relevance));
   const ideal=dcg(c.candidates.map(x=>x.relevance).sort((a,b)=>b-a).slice(0,3));
   const ndcg=ideal===0?1:observed/ideal;
   expect(ndcg).toBeGreaterThanOrEqual(c.minNdcgAt3-0.000001);
  });
 }
 it('reorders only the bounded returned provider records and still quarantines all metadata',async()=>{
  const ingest=vi.fn().mockImplementation(async()=>({signal:{id:'quarantined'},replayed:false}));
  const response={resultList:{result:[
   {id:'222',source:'MED',title:'Unrelated methods',abstractText:'General information'},
   {id:'111',source:'MED',title:'Long read sequencing',abstractText:'Technical source'}
  ]}};
  const fetcher=vi.fn().mockResolvedValue({ok:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(response)});
  vi.stubGlobal('fetch',fetcher);
  const connector=new ScientificLiteratureConnector({ingest} as any);
  const result=await connector.discover('tenant-a',{query:'long read sequencing',sector:'sequencing',maxResults:2});
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('ebi.ac.uk/europepmc');
  expect(ingest).toHaveBeenCalledTimes(2);
  expect(ingest.mock.calls[0]?.[1]).toMatchObject({
   sourceUrl:'https://europepmc.org/article/MED/111',sourceTitle:'Long read sequencing'
  });
  expect(ingest.mock.calls[1]?.[1]).toMatchObject({sourceUrl:'https://europepmc.org/article/MED/222'});
  expect(result).toMatchObject({publicationAuthorized:false,status:'QUARANTINED',verification:'UNVERIFIED_PROVIDER_METADATA'});
 });
});
