import {BadRequestException} from '@nestjs/common';
/** Bounded EBML signature/DocType inspection only. Not full decode or malware scanning. */
export function isOfflineWebm(bytes:Uint8Array){
 if(bytes.length<100||bytes.length>1048576||Buffer.from(bytes.subarray(0,4)).toString('hex')!=='1a45dfa3')return false;
 const b=Buffer.from(bytes),readSize=(at:number)=>{
  if(at>=b.length)return null;
  let mask=128,width=1;while(width<=8&&!(b[at]!&mask)){mask>>=1;width++;}
  if(width>4||at+width>b.length)return null;
  let value=b[at]!&(mask-1);for(let i=1;i<width;i++)value=value*256+b[at+i]!;
  if(value===2**(width*7)-1)return null;return{value,width};
 };
 const h=readSize(4);if(!h||h.value<8||h.value>4096||4+h.width+h.value>=b.length)return false;
 let i=4+h.width,end=i+h.value,found=false;
 while(i<end){
  let mask=128,width=1;while(width<=4&&!(b[i]!&mask)){mask>>=1;width++;}
  if(width>4||i+width>end)return false;
  const id=b.subarray(i,i+width).toString('hex');i+=width;
  const size=readSize(i);if(!size||i+size.width+size.value>end)return false;i+=size.width;
  if(id==='4282'){if(found||b.subarray(i,i+size.value).toString('ascii')!=='webm')return false;found=true;}
  i+=size.value;
 }
 return found&&b.subarray(end,end+4).toString('hex')==='18538067';
}
export function offlineWebmBytes(raw:unknown){
 if(typeof raw!=='string'||raw.length<140||raw.length>1398104||!/^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw new BadRequestException('Bounded local WebM bytes required');
 const bytes=Buffer.from(raw,'base64');
 if(bytes.toString('base64')!==raw||!isOfflineWebm(bytes))throw new BadRequestException('Invalid bounded WebM container signature');
 return bytes;
}
