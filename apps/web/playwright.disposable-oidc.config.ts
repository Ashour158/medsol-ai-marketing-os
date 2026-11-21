import {defineConfig} from '@playwright/test';
import realStack from './playwright.staging.config';
/** Same compiled Nest, production Next and restricted real PostgreSQL topology
 * as R3-Y, but separate browser evidence for genuine interactive login.
 */
export default defineConfig({
 ...realStack,
 testMatch:'**/t1d-oidc-login.pw.ts',
 reporter:[['list'],['html',{open:'never',outputFolder:'t1d-playwright-report'}],
  ['json',{outputFile:'t1d-playwright-report/t1d-results.json'}]],
 outputDir:'t1d-test-results'
});
