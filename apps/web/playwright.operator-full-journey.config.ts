import {defineConfig} from '@playwright/test';
import operator from './playwright.operator-staging.config';

/** T1F real signed interactive maker/checker across actual application owners.
 * Distinct runtime evidence. No provider credentials, fixture-only OIDC identities.
 */
export default defineConfig({
 ...operator,
 testMatch:'**/t1f-signed-operator-journey.pw.ts',
 reporter:[['list'],['html',{open:'never',outputFolder:'t1f-playwright-report'}],
  ['json',{outputFile:'t1f-playwright-report/t1f-results.json'}]],
 outputDir:'t1f-test-results'
});
