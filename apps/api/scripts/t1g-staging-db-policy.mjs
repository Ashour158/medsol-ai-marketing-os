/**
 * Pure operator-staging DSN policy. No connection attempts, no secret logging.
 * Does not replace driver TLS verification or database FORCE RLS.
 */
export function assertStagingDatabaseDsn(raw, {disposableCi=false}={}){
 if(typeof raw!=='string'||!raw)throw Error('PostgreSQL runtime DSN required');
 let db;
 try{db=new URL(raw);}catch{throw Error('Malformed database URL');}
 if(db.protocol!=='postgresql:'||!db.username||!db.password)
  throw Error('PostgreSQL runtime DSN invalid');
 if(disposableCi)return;
 if(db.searchParams.getAll('sslmode').length!==1||
    db.searchParams.get('sslmode')!=='verify-full')
  throw Error('Staging PostgreSQL requires exactly one sslmode=verify-full');
 if(!db.hostname||['localhost','127.0.0.1','0.0.0.0','::1'].includes(db.hostname))
  throw Error('Staging PostgreSQL requires a dedicated non-loopback endpoint');
 if(db.searchParams.has('sslrootcert')&&db.searchParams.getAll('sslrootcert').length!==1)
  throw Error('Staging PostgreSQL forbids duplicate trust-anchor settings');
 for(const key of ['options','service','host','hostaddr'])
  if(db.searchParams.has(key))
   throw Error('Staging PostgreSQL forbids connection-routing and session overrides');
 if(!/staging/i.test(db.pathname)||['postgres','medsol','marketing_test'].includes(db.username))
  throw Error('Staging PostgreSQL requires dedicated staging database and application role');
}
