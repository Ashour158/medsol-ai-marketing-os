import {defineConfig,type WebServerConfig} from "@playwright/test";
import {readFileSync} from "node:fs";
import operator from "./playwright.operator-staging.config";
/** Disposable GitHub Actions-only offline DAG operator acceptance.
 * Signature authority exists solely in the runner ephemeral filesystem.
 * Never use a live provider, deployed staging key, or production credentials.
 */
if(process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
 process.env.MARKETING_R3Y_STAGING_CI_ONLY!=="1"||
 process.env.MARKETING_DB_INTEGRATION!=="1")
 throw Error("T3C_BROWSER_BLOCKED: disposable GitHub CI only");
const key="/tmp/medsol-r3y-jwks/t3c-dag-public.pem";
const servers=Array.isArray(operator.webServer)?operator.webServer:
 [operator.webServer! as WebServerConfig];
export default defineConfig({
 ...operator,testMatch:"**/t3c-offline-dag-operator.pw.ts",
 reporter:[["list"],["html",{open:"never",outputFolder:"t3c-playwright-report"}],
  ["json",{outputFile:"t3c-playwright-report/t3c-results.json"}]],
 outputDir:"t3c-test-results",
 webServer:servers.map(server=>({...server,env:{...server.env,
  MARKETING_DAG_OFFLINE_EXECUTION_ENABLED:"true",
  MARKETING_DAG_TRUSTED_KEY_ID:"t3c-ci-ephemeral",
  MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM:readFileSync(key,"utf8")
 }}))
});
