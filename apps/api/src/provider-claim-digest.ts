import {createHash} from 'node:crypto';
import {BadRequestException} from '@nestjs/common';

export function providerClaimDigest(
 tenant:string,connection:string,kind:'ACCOUNT'|'POST',reference:string
):string{
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(tenant)||
  !/^[A-Za-z0-9_-]{1,128}$/.test(connection)||
  !/^[0-9]{4,32}(?:_[0-9]{4,32})?$/.test(reference))
  throw new BadRequestException('Invalid tenant-bound provider claim reference');
 if(kind==='ACCOUNT'&&reference.includes('_'))
  throw new BadRequestException('Account claim must not contain post ID');
 if(kind==='POST'&&!reference.includes('_'))
  throw new BadRequestException('Post claim must include account ID');
 return 'sha256:'+createHash('sha256').update(JSON.stringify([
  'medsol-r2e-signed-claim-v1',tenant,connection,'META_GRAPH',kind,reference
 ])).digest('hex');
}
