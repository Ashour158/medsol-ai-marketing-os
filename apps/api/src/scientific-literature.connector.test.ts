import { describe,expect,it,vi,afterEach } from 'vitest';
import { ScientificLiteratureConnector } from './scientific-literature.connector.js';
import { permissionForMarketingRoute } from './marketing-permissions.js';

afterEach(()=>vi.unstubAllGlobals());
describe('read-only scientific source integration',()=>{
 it('does not fetch user-supplied hosts or unsanctioned sector searches',async()=>{
  const fetcher=vi.fn();
  vi.stubGlobal('fetch',fetcher);
  const connector=new ScientificLiteratureConnector({ingest:vi.fn()} as any);
  await expect(connector.discover('tenant',{query:'test',sector:'secret'})).rejects.toThrow('Unsupported');
  await expect(connector.discover('tenant',{query:'http://private-host',sector:'genomics'})).rejects.toThrow('Invalid');
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('ingests only source-scoped literature metadata as unverified quarantined signals',async()=>{
  const ingest=vi.fn().mockResolvedValue({signal:{id:'sig-1'},replayed:false});
  const fetcher=vi.fn().mockResolvedValue({
   ok:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({resultList:{result:[
    {id:'1234',source:'MED',title:'Transcriptomics study',abstractText:'Investigated sequencing',firstPublicationDate:'2026-01-20'},
    {id:'bad',source:'UNSUPPORTED',title:'Irrelevant source'}
   ]}})
  });
  vi.stubGlobal('fetch',fetcher);
  const connector=new ScientificLiteratureConnector({ingest} as any);
  const output=await connector.discover('tenant',{query:'transcriptomics',sector:'genomics',maxResults:3});
  expect(fetcher).toHaveBeenCalledOnce();
  expect(String(fetcher.mock.calls[0]![0])).toContain('ebi.ac.uk/europepmc');
  expect(ingest).toHaveBeenCalledWith('tenant',expect.objectContaining({sourceUrl:'https://europepmc.org/article/MED/1234',sourceTitle:'Transcriptomics study'}));
  expect(output.count).toBe(1);
  expect(output.publicationAuthorized).toBe(false);
  expect(output.status).toBe('QUARANTINED');
 });
 it('restricts discovery to authorized marketing operators',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/learning/discover')).toBe('ASSESS');
 });
});
