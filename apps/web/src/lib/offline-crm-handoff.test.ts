import {describe,it,expect} from "vitest";
import {modelOfflineCrmHandoff,type OfflineHandoffInput} from "./offline-revenue-scenarios";
import {crmHandoffRehearsalCsv} from "./offline-evidence-csv";

const base:OfflineHandoffInput={
 funnel:{virtualVisits:"100",virtualCtaClicks:"20",virtualFormSubmissions:"8",
  virtualQualifiedLeads:"3",failureCase:"NONE"},
 mockConsent:"GRANTED",mockDedupe:"UNIQUE",mockTransport:"ACCEPTED",
 requestKey:"synthetic-request-001"
};
describe("T1 anonymous CRM handoff rehearsal: no contact or external effects",()=>{
 it("models accepted transport as a mock-only disposition, not a created lead",()=>{
  const r=modelOfflineCrmHandoff(base);
  expect(r.status).toBe("MOCK_ACCEPTED");
  expect(r.actualLeadsCreated).toBe(0);
  expect(r.crmHandoffsExecuted).toBe(0);
  expect(r.legalConsentVerified).toBe(false);
  expect(r.automaticRetryAuthorized).toBe(false);
  expect(r.externalEffectsAuthorized).toBe(false);
  const csv=crmHandoffRehearsalCsv(base,r);
  expect(csv).toContain("MOCK_ACCEPTED");
  expect(csv).toContain("NOT_CERTIFIED");
  expect(csv).not.toContain(base.requestKey);
 });
 it.each([
  [{mockConsent:"DENIED" as const},"MOCK_CONSENT_NOT_GRANTED"],
  [{mockConsent:"WITHDRAWN" as const},"MOCK_CONSENT_NOT_GRANTED"],
  [{mockDedupe:"DUPLICATE" as const},"DUPLICATE_MOCK_REQUEST"],
  [{funnel:{...base.funnel,failureCase:"BOT_REJECTED" as const}},"FUNNEL_SCENARIO_BLOCKED"],
  [{funnel:{...base.funnel,virtualQualifiedLeads:"0"}},"NO_MOCK_QUALIFIED_LEADS"]
 ])("blocks unsafe proposed handoffs", (changes,reason)=>{
  const result=modelOfflineCrmHandoff({...base,...changes});
  expect(result.status).toBe("BLOCKED");
  expect(result.blockers).toContain(reason);
  expect(result.simulatedProviderResponse).toBe("NOT_ATTEMPTED");
 });
 it("halts on uncertain virtual delivery and never authorizes automatic retries",()=>{
  const r=modelOfflineCrmHandoff({...base,mockTransport:"OUTCOME_UNKNOWN"});
  expect(r.status).toBe("OUTCOME_UNKNOWN");
  expect(r.automaticRetryAuthorized).toBe(false);
  expect(r.crmHandoffsExecuted).toBe(0);
  expect(modelOfflineCrmHandoff({...base,mockTransport:"REJECTED"}).status)
   .toBe("MOCK_REJECTED");
 });
 it("rejects missing, short, malformed or oversized idempotency keys",()=>{
  for(const key of ["short","invalid/name","a".repeat(81),"", "=SUM(A1)"]){
   expect(()=>modelOfflineCrmHandoff({...base,requestKey:key})).toThrow();
  }
 });
 it("rejects inconsistent funnel math, forged effects and mutation of CSV output",()=>{
  expect(()=>modelOfflineCrmHandoff({...base,funnel:{
   ...base.funnel,virtualQualifiedLeads:"30"}})).toThrow();
  const r=modelOfflineCrmHandoff(base);
  expect(()=>crmHandoffRehearsalCsv(base,{...r,
   actualLeadsCreated:1 as 0})).toThrow("OFFLINE_CSV_BLOCKED");
  expect(()=>crmHandoffRehearsalCsv(base,{...r,
   legalConsentVerified:true as false})).toThrow("OFFLINE_CSV_BLOCKED");
  expect(()=>crmHandoffRehearsalCsv({...base,mockConsent:"DENIED"},r))
   .toThrow("OFFLINE_CSV_BLOCKED");
 });
});
