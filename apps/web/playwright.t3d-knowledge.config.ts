import {defineConfig,type WebServerConfig} from "@playwright/test";
import {readFileSync} from "node:fs";
import base from "./playwright.operator-staging.config";
/** CI-only compiled Next/Nest/PG test, signed by an ephemeral offline DAG key.
 * Learning/knowledge are local reviewed fixtures: no AI/provider account.
 */
if(process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
 process.env.MARKETING_R3Y_STAGING_CI_ONLY!=="1"||
 process.env.MARKETING_DB_INTEGRATION!=="1")
 throw Error("T3D_SIGNED_KNOWLEDGE_TEST_CI_ONLY");
const servers=Array.isArray(base.webServer)?base.webServer:
 [base.webServer! as WebServerConfig];
export default defineConfig({
 ...base,testMatch:"**/t3d-signed-knowledge-dag.pw.ts",
 reporter:[["list"],["html",{open:"never",outputFolder:"t3d-playwright-report"}],
  ["json",{outputFile:"t3d-playwright-report/t3d-results.json"}]],
 outputDir:"t3d-test-results",
 webServer:servers.map(server=>({...server,env:{...server.env,
  MARKETING_DAG_OFFLINE_EXECUTION_ENABLED:"true",
  MARKETING_DAG_KNOWLEDGE_ENABLED:"true",
  MARKETING_DAG_TRUSTED_KEY_ID:"t3d-ci-ephemeral",
  MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM:
   readFileSync("/tmp/medsol-r3y-jwks/t3d-dag-public.pem","utf8")
 }}))
});
