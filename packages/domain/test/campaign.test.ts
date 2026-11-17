import {canTransitionCampaign} from '../src/index.js';
if(!canTransitionCampaign('IDEA','ASSESSMENT')) throw new Error('expected valid transition');
if(canTransitionCampaign('IDEA','LIVE')) throw new Error('expected invalid transition');
