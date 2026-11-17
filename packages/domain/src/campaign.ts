import {assertCampaignTransition} from './index.js';
export interface CampaignAggregate{id:string;organizationId:string;status:string;version:number}
export function transitionCampaign(c:CampaignAggregate,to:string):CampaignAggregate{assertCampaignTransition(c.status,to);return{...c,status:to,version:c.version+1}}
export function assertTenant(resourceOrganizationId:string,requestOrganizationId:string){if(resourceOrganizationId!==requestOrganizationId)throw new Error('Tenant boundary violation')}