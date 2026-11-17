import {evaluateRisk} from '../src/index.js';
const r1=evaluateRisk({capability:'CREATE_CAMPAIGN',grantedCapabilities:['CREATE_CAMPAIGN'],riskLevel:'R1'}); if(!r1.allowed||r1.approvalRequired)throw new Error('R1 policy failed');
const r4=evaluateRisk({capability:'PUBLISH',grantedCapabilities:['PUBLISH'],riskLevel:'R4'}); if(r4.allowed||!r4.approvalRequired)throw new Error('R4 policy failed');
