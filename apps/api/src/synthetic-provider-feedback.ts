/** Provider event mapping adapted from Dittofeed (MIT).
 * packages/backend-lib/src/destinations/mailchimp.ts blob dba1ca3914074a6962c3f281baffdc9afa8c677d
 * packages/backend-lib/src/destinations/sendgrid.ts blob b1f2bd4053cb3598cd942709974b8e02cea89bdf
 * Only suppression event vocabulary reused. Removed all webhook ingress,
 * workspace-ID trust, PII, network activity and automatic delivery handling.
 * This is an operator-authored fixture, never a verified provider callback.
 *
 * MIT License
 * 
 * Copyright (c) [2023] [Idea Market inc.]
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
export type SyntheticProviderFeedback={
 provider:'SENDGRID'|'MAILCHIMP_TRANSACTIONAL';
 fixtureEventId:string;
 action:'SIMULATED_COMPLAINT'|'SIMULATED_HARD_BOUNCE'|'SIMULATED_WITHDRAWAL';
};
export function normalizeSyntheticProviderFeedback(raw:unknown):SyntheticProviderFeedback{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  Object.keys(raw).some(k=>!['provider','fixtureEventId','event','bounceType'].includes(k)))
  throw Error('Anonymous synthetic feedback fields only; no real webhook or recipient data');
 const r=raw as Record<string,unknown>;
 if(typeof r.fixtureEventId!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(r.fixtureEventId))
  throw Error('Explicit synthetic fixture event identifier required');
 let action:SyntheticProviderFeedback['action'];
 if(r.provider==='MAILCHIMP_TRANSACTIONAL'){
  if(r.bounceType!==undefined)throw Error('Unexpected bounce classification for Mailchimp fixture');
  switch(r.event){
   case 'hard_bounce': action='SIMULATED_HARD_BOUNCE';break;
   case 'spam': action='SIMULATED_COMPLAINT';break;
   default:throw Error('Unsupported Mailchimp suppression fixture');
  }
 }else if(r.provider==='SENDGRID'){
  switch(r.event){
   case 'bounce':
    // Unlike upstream, generic bounce alone never proves permanent suppression.
    if(r.bounceType!=='HARD')throw Error('Explicit hard-bounce fixture classification required');
    action='SIMULATED_HARD_BOUNCE';break;
   case 'spamreport':
    if(r.bounceType!==undefined)throw Error('Unexpected bounce classification');
    action='SIMULATED_COMPLAINT';break;
   case 'unsubscribe':
    if(r.bounceType!==undefined)throw Error('Unexpected bounce classification');
    // Medsol-only fixture: a preference withdrawal is not legal consent proof.
    action='SIMULATED_WITHDRAWAL';break;
   default:throw Error('Unsupported SendGrid suppression fixture');
  }
 }else throw Error('Unsupported synthetic feedback provider');
 return{provider:r.provider,fixtureEventId:r.fixtureEventId,action};
}
