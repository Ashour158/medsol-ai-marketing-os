import type {Server} from 'node:http';
import {PrismaService} from './prisma.service.js';
import {
 ProviderWebhookEvidenceService,type MetaWebhookSecretResolver
} from './provider-webhook-evidence.service.js';
import {
 MetaWebhookIngress,type MetaCallbackBinding
} from './meta-webhook-ingress.js';

/**
 * Explicit composition root for an ISOLATED public callback process.
 * The main Marketing API remains OIDC-protected and is not reused as a
 * unauthenticated webhook router. A deployment must supply approved
 * account/connection bindings and a managed secret resolver at startup.
 *
 * No default listener, network binding, callback secret or public HTTP route
 * is created as a side effect of importing this module.
 */
export function buildMetaWebhookRuntime(input:{
 db:PrismaService;
 bindings:readonly MetaCallbackBinding[];
 secrets:MetaWebhookSecretResolver;
}):{
 server:Server;
 ingress:MetaWebhookIngress;
 evidence:ProviderWebhookEvidenceService;
}{
 if(!(input?.db instanceof PrismaService)||
    !input.secrets||typeof input.secrets.secretFor!=='function')
  throw new Error('Explicit approved database and per-connection secret resolver required');
 const evidence=new ProviderWebhookEvidenceService(input.db,input.secrets);
 const ingress=new MetaWebhookIngress(input.bindings,evidence);
 return{server:ingress.createServer(),ingress,evidence};
}
