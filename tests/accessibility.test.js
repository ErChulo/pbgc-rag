'use strict';
const {showAllTools}=require('./helpers/ui.js');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const targetURL = process.env.PBGC_TEST_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
function luminance(rgb) {
  const values = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
function ratio(a, b) { const [light, dark] = [luminance(a), luminance(b)].sort((a,b) => b-a); return (light+.05)/(dark+.05); }

async function checkVisible(page,theme) {
  const pairs = await page.evaluate(() => {
    const selectors = ['body','p','.step > span','label','a','button','input','select','small','.logo','footer'];
    const result = [];
    for (const selector of selectors) for (const node of document.querySelectorAll(selector)) {
      if (!node.getClientRects().length || node.disabled) continue;
      const style = getComputedStyle(node);
      let background = style.backgroundColor;
      let ancestor = node.parentElement;
      while ((background === 'rgba(0, 0, 0, 0)' || background === 'transparent') && ancestor) { background = getComputedStyle(ancestor).backgroundColor; ancestor = ancestor.parentElement; }
      if (background === 'rgba(0, 0, 0, 0)') background = 'rgb(0, 0, 0)';
      result.push({selector,text:node.textContent.slice(0,35),color:style.color,background});
    }
    return result;
  });
  for (const pair of pairs) assert.ok(ratio(pair.color,pair.background) >= 4.5, `${theme} ${pair.selector} ${pair.text}: contrast ${ratio(pair.color,pair.background).toFixed(2)}`);
  const boundaries=await page.evaluate(()=>[...document.querySelectorAll('input,select,button')].filter(node=>node.getClientRects().length&&!node.disabled).map(node=>{
    const style=getComputedStyle(node);let parent=node.parentElement,background='rgba(0, 0, 0, 0)';
    while(parent&&(background==='rgba(0, 0, 0, 0)'||background==='transparent')){background=getComputedStyle(parent).backgroundColor;parent=parent.parentElement;}
    return {id:node.id,border:style.borderTopColor,width:parseFloat(style.borderTopWidth),background};
  }));
  for(const boundary of boundaries){assert.ok(boundary.width>=1,`${theme} ${boundary.id} has visible boundary`);assert.ok(ratio(boundary.border,boundary.background)>=3,`${theme} ${boundary.id} boundary contrast ${ratio(boundary.border,boundary.background).toFixed(2)}`);}
}
test('visible text contrast, labeled controls and keyboard skip navigation in both themes', async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage();
  try {
    await page.goto(targetURL);
    await page.waitForFunction(() => !document.querySelector('#demo').disabled);
    // Include the actual first-run screens, not only the expert workspace.
    for (const theme of ['dark','light']) {
      const light=await page.locator('body').evaluate(node=>node.classList.contains('light'));
      if(light!==(theme==='light'))await page.locator('#theme-toggle').click();
      await checkVisible(page,theme+' welcome');
      await page.locator('#guide-start').click();
      await page.waitForFunction(()=>document.querySelector('#guide').dataset.step==='qwen');
      await checkVisible(page,theme+' Qwen');
      await page.locator('#guide-back').click();
      await page.waitForFunction(()=>document.querySelector('#guide').dataset.step==='welcome');
    }
    // Restart navigation at the page entry to verify the skip link by keyboard.
    await page.goto(targetURL);await page.waitForFunction(()=>!document.querySelector('#demo').disabled);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Enter');
    await page.waitForURL(/#main$/);
    assert.match(page.url(), /#main$/);
    await showAllTools(page);
    const problems = await page.evaluate(() => [...document.querySelectorAll('input,select,textarea')].filter(node => !node.labels?.length && !node.getAttribute('aria-label') && !node.getAttribute('aria-labelledby')).map(node => node.id));
    assert.deepEqual(problems, [], 'every input has a visible or accessible label');
    assert.equal(await page.locator('h1').count(), 1);
    for (const theme of ['dark', 'light']) {
      const light=await page.locator('body').evaluate(node=>node.classList.contains('light'));
      if(light!==(theme==='light'))await page.locator('#theme-toggle').click();
      await checkVisible(page,theme);

    }
    await page.setViewportSize({width:375,height:812});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile viewport has no horizontal overflow');
  } catch(error) {
    if(process.env.GITHUB_ACTIONS){const message=String(error.message||'Accessibility assertion failed').split('\n')[0].slice(0,220).replace(/%/g,'%25').replace(/\r/g,'%0D');process.stdout.write('::error title=Static UI accessibility detail::'+message+'\n');}
    throw error;
  } finally { await browser.close(); }
});
