import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {assessPullRequestReview,PR_REVIEW_POLICY_VERSION} from './pr-review-salvage-policy.mjs';

const corpus=JSON.parse(readFileSync(new URL('./fixtures/pr-review-salvage-golden.json',import.meta.url),'utf8'));
test('maintainer corpus has distinct bounded cases, reviewed policy version and no authority',()=>{
 assert.equal(PR_REVIEW_POLICY_VERSION,'1.0');
 assert.equal(corpus.schemaVersion,1);
 assert.ok(corpus.cases.length>=12);
 assert.equal(new Set(corpus.cases.map(x=>x.id)).size,corpus.cases.length);
 assert.ok(corpus.purpose.includes('no automation'));
});
for(const c of corpus.cases){
 test('PR salvage/review fixture: '+c.id,()=>{
  const actual=assessPullRequestReview({...corpus.defaultInput,...c.input},
    new Date(corpus.asOf),corpus.staleAfterDays);
  assert.equal(actual.recommendation,c.expectedRecommendation);
  assert.ok(actual.reasons.includes(c.expectedReason));
  assert.equal(actual.advisoryOnly,true);
  for(const key of ['mergeAuthorized','closeAuthorized','reopenAuthorized',
   'commentAuthorized','checksPublicationAuthorized'])assert.equal(actual[key],false);
 });
}
test('unrecognized states, invalid threads, future timestamps and malformed data fail closed',()=>{
 const base=corpus.defaultInput,now=new Date(corpus.asOf);
 for(const change of [{state:'UNKNOWN'},{checks:'GREENISH'},{review:'AUTO_APPROVE'},
  {unresolvedThreads:-1},{unresolvedThreads:0.5},{updatedAt:'2999-01-01T00:00:00Z'},
  {draft:'false'},{number:0}]){
  assert.throws(()=>assessPullRequestReview({...base,...change},now));
 }
 assert.throws(()=>assessPullRequestReview({},now));
});
