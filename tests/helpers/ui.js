'use strict';
// Broad engineering regressions deliberately use the visible power-user view.
// The guided first-run path is covered separately by ux-flow.test.js.
async function dismissGuide(page) {
  const skip = page.locator('#guide-skip');
  if (await skip.isVisible()) await skip.click();
}
async function showAllTools(page) {
  await dismissGuide(page);
  const control = page.locator('#all-tools');
  if (!await page.locator('#workspace').isVisible()) await page.getByRole('link',{name:'Workspace',exact:true}).click();
  await control.waitFor({state:'visible'});
  if (await control.getAttribute('aria-pressed') !== 'true') await control.click();
  for (const section of [page.locator('#advanced-exports'), page.locator('#panel-save > details').filter({has:page.locator(':scope > summary', {hasText:'Recovery and browser storage'})})]) {
    if (!await section.evaluate(node => node.open)) await section.locator(':scope > summary').click();
  }
}
async function openModelSetup(page) {
  const setup = page.locator('#model-setup');
  if (!await setup.evaluate(node => node.open)) await setup.locator(':scope > summary').click();
}
async function openManualModel(page) {
  await openModelSetup(page);
  const manual=page.locator('#manual-model');
  if(!await manual.evaluate(node=>node.open))await manual.locator(':scope > summary').click();
}
async function openDictionaryTools(page) {
  const dictionary = page.locator('#dictionary-tools');
  if (!await dictionary.evaluate(node => node.open)) await dictionary.locator(':scope > summary').click();
}
module.exports = {showAllTools, openModelSetup, openManualModel, openDictionaryTools, dismissGuide};
