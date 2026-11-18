import { describe,it,expect,vi } from 'vitest';
import {MarketingLearningService} from './marketing-learning.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
describe('evidence-linked market trend intelligence',()=>{
 it('ranks only human-reviewed, tenant-scoped signals and never reports independent verification',async()=>{
  const recent=new Date();
  const signals=[
   {id:'1',topic:'Protein sequencing',sector:'proteomics',sourceUrl:'https://source-a.org/a',sourceTitle:'A',sourcePublishedAt:null,observedAt:recent},
   {id:'2',topic:'Protein sequencing',sector:'proteomics',sourceUrl:'https://source-b.org/b',sourceTitle:'B',sourcePublishedAt:null,observedAt:recent},
   {id:'3',topic:'Protein sequencing',sector:'proteomics',sourceUrl:'https://source-a.org/c',sourceTitle:'C',sourcePublishedAt:null,observedAt:recent}
  ];
  const db:any={learningSignal:{findMany:vi.fn().mockResolvedValue(signals)}};
  const service=new MarketingLearningService(db);
  const brief=await service.trendBrief('tenant','proteomics');
  expect(db.learningSignal.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{organizationId:'tenant',status:'REVIEWED',sector:'proteomics'}}));
  expect(brief.topics[0]?.priority).toBe('RESEARCH_PRIORITY');
  expect(brief.topics[0]?.distinctSourceHosts).toBe(2);
  expect(brief.topics[0]?.inferenceAuthorized).toBe(false);
  expect(brief.independentVerification).toBe(false);
 });
 it('requires audit permission to read trend briefs',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/learning/trends')).toBe('READ_AUDIT');
 });
});
