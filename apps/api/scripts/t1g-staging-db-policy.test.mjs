import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {assertStagingDatabaseDsn} from './t1g-staging-db-policy.mjs';
const base='postgresql://staging_app:synthetic-password@db.staging.internal:5432/marketing_staging?sslmode=verify-full';
test('valid operator staging DSN passes without connecting',()=>{
 assert.equal(assertStagingDatabaseDsn(base),undefined);
});
for(const [name,dsn] of [
 ['no TLS',base.replace('?sslmode=verify-full','')],
 ['unencrypted',base.replace('verify-full','disable')],
 ['no hostname check',base.replace('verify-full','verify-ca')],
 ['duplicate sslmode',base+'&sslmode=disable'],
 ['loopback host',base.replace('db.staging.internal','localhost')],
 ['loopback IPv4',base.replace('db.staging.internal','127.0.0.1')],
 ['duplicate trust root',base+'&sslrootcert=a&sslrootcert=b'],
 ['host override',base+'&host=evil.invalid'],
 ['hostaddr override',base+'&hostaddr=192.0.2.10'],
 ['service override',base+'&service=other'],
 ['session options override',base+'&options=-c%20search_path%3Dpublic'],
 ['privileged user',base.replace('staging_app','postgres')],
 ['non-staging database',base.replace('marketing_staging','marketing_prod')],
 ['missing password',base.replace('synthetic-password','')],
 ['invalid protocol',base.replace('postgresql:','http:')]
])test('reject '+name,()=>assert.throws(()=>assertStagingDatabaseDsn(dsn)));
test('disposable CI bypasses only staging-specific constraints',()=>{
 assert.equal(assertStagingDatabaseDsn('postgresql://marketing_test:pass@localhost:5432/marketing_test',{disposableCi:true}),undefined);
 assert.throws(()=>assertStagingDatabaseDsn('postgresql://marketing_test@localhost:5432/marketing_test',{disposableCi:true}));
});
