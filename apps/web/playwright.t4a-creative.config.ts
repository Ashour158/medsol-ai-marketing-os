import {defineConfig} from "@playwright/test";
import operator from "./playwright.operator-staging.config";
/** Real compiled Next+Nest+restricted PostgreSQL+signed disposable OIDC.
 * No remote creative AI, storage, mail, social platforms or paid hosting.
 */
if(process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
 process.env.MARKETING_R3Y_STAGING_CI_ONLY!=="1"||
 process.env.MARKETING_DB_INTEGRATION!=="1")
 throw Error("T4A_OFFLINE_CREATIVE_ACCEPTANCE_CI_ONLY");
export default defineConfig({
 ...operator,testMatch:"**/t4a-offline-creative-iteration.pw.ts",
 reporter:[["list"],["html",{open:"never",outputFolder:"t4a-playwright-report"}],
  ["json",{outputFile:"t4a-playwright-report/t4a-results.json"}]],
 outputDir:"t4a-test-results"
});
