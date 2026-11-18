import {describe,expect,it,vi} from 'vitest';
import {MarketingCommandCenterService} from './marketing-command-center.service.js';
import {permissionForMarketingRoute,hasMarketingPermission} from './marketing-permissions.js';
const stale=new Date(Date.now()-31*60_000);
const db:any={
 brainRun:{findMany:vi.fn().mockImplementation(async ({where}:any)=>{
   if(where.status==='RUNNING')return [{id:'stale-run',status:'RUNNING',updatedAt:stale,currentAgentId:'MKT-STR-001'}];
   if(where.status==='NEEDS_INTERVENTION')return [{id:'failed-run',status:'NEEDS_INTERVENTION',updatedAt:stale,currentAgentId:null,lastError:'Interrupted model call'}];
   return[{id:'failed-run',status:'NEEDS_INTERVENTION',updatedAt:stale,currentAgentId:null,createdAt:stale,commandKey:'cmd1'}];
 }),count:vi.fn().mockResolvedValue(25)},
 approval:{count:vi.fn().mockResolvedValue(2)},
 agentSkillProposal:{count:vi.fn().mockResolvedValue(1)}
};
const reads:any={overview:vi.fn().mockResolvedValue({campaigns:4,failedAgentExecutions:2}),
 agentOperations:vi.fn().mockResolvedValue({total:8,byStatus:{COMPLETED:6,FAILED:2},recent:[]})};
const delivery:any={summary:vi.fn().mockResolvedValue({pending:1,retrying:1,deadLetters:1,oldestDeadLetters:[
 {id:'e1',eventId:'event1',eventType:'BRAIN_AGENT_STEP_COMPLETED',attempts:8,lastError:'No consumer',deadLetteredAt:stale}
]})};
const budgets:any={summary:vi.fn().mockResolvedValue({enabled:true,estimatedSpentMicros:'1200',verifiedBilledMicros:'900',
 awaitingInvoiceCount:1,requiresExternalBillingReconciliation:true})};
const learning:any={trendBrief:vi.fn().mockResolvedValue({topics:[{topic:'Sequencing',sector:'genomics',recentSignals90Days:3,distinctSourceHosts:2,status:'REVIEWED'}]})};
const brand:any={active:vi.fn().mockResolvedValue({version:4,approvedAt:stale})};

describe('operational Command Center isolation and incident classification',()=>{
 it('composes authoritative tenant-scoped read owners without reimplementing writes',async()=>{
  const service=new MarketingCommandCenterService(db,reads,delivery,budgets,learning,brand);
  const result=await service.snapshot('tenant-a');
  expect(result.health).toBe('ACTION_REQUIRED');
  expect(result.totals.brainRuns).toBe(25);
  expect(result.totals.pendingApprovals).toBe(2);
  expect(result.incidents.map(x=>x.kind)).toEqual(['BRAIN_NEEDS_INTERVENTION','BRAIN_STALE','OUTBOX_DEAD_LETTER']);
  expect(result.modelBudget.estimatedSpentMicros).toBe('1200');
  expect(result.modelBudget.verifiedBilledMicros).toBe('900');
  expect(result.controls.externalPublishingEnabled).toBe(false);
  expect(db.brainRun.count).toHaveBeenCalledWith({where:{organizationId:'tenant-a'}});
  for(const call of db.brainRun.findMany.mock.calls)expect(call[0].where.organizationId).toBe('tenant-a');
  expect(reads.overview).toHaveBeenCalledWith('tenant-a');
  expect(learning.trendBrief).toHaveBeenCalledWith('tenant-a');
  expect(brand.active).toHaveBeenCalledWith('tenant-a');
 });
 it('requires authenticated manager audit authority',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/command-center')).toBe('READ_AUDIT');
  expect(hasMarketingPermission({role:'VIEWER'} as any,'READ_AUDIT')).toBe(false);
  expect(hasMarketingPermission({role:'MARKETING_DIRECTOR'} as any,'READ_AUDIT')).toBe(true);
 });
});
