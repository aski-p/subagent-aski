import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const server = await createServer({configFile:false, publicDir:'public',
  resolve:{alias:{'next/image':new URL('./fixtures/lounge-presentation/next-image.ts',import.meta.url).pathname}},
  server:{port:0,host:'127.0.0.1'}, appType:'spa'});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/lounge-presentation/`;
const browser = await chromium.launch({headless:true});
try {
  await mkdir('.superpowers/sdd/2026-10-29-boss-agent-lounge/preview',{recursive:true});
  for (const width of [1280,375]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    let posts=0;
    page.on('request',r=>{if(r.method()==='POST')posts++});
    await page.goto(url);
    await page.locator('.lounge-role').first().waitFor();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.lounge-role img')).every(i=>i.complete && i.naturalWidth>0));
    assert.equal(await page.locator('.lounge-role').count(),6);
    assert.equal(await page.locator('.lounge-desk').count(),6);
    assert.equal(await page.locator('.lounge-meeting').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const idle=page.locator('.lounge-avatar--idle .lounge-robot');
    const positions=await idle.evaluateAll(es=>es.map(e=>getComputedStyle(e).transform));
    await page.waitForTimeout(700);
    const moved=await idle.evaluateAll(es=>es.map(e=>getComputedStyle(e).transform));
    assert.ok(moved.filter((v,i)=>v!==positions[i]).length>=3);
    assert.equal(await page.locator('.lounge-avatar--blocked .lounge-sweat').count(),0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable:true,value:true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await idle.first().evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {configurable:true,value:false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await idle.first().evaluate(e=>getComputedStyle(e).animationPlayState),'running');
    await page.locator('.lounge-preview summary').click();
    assert.equal(await page.locator('.lounge-preview .lounge-paper').count(),1);
    assert.equal(await page.locator('.lounge-preview .lounge-thought').count(),1);
    await page.screenshot({path:`.superpowers/sdd/2026-10-29-boss-agent-lounge/preview/effects-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'움직임 일시정지'}).click();
    assert.equal(await idle.first().evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
    assert.equal(await page.locator('.lounge-preview .lounge-sweat').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
    assert.equal(posts,0);
    await page.close();
  }
  const reduced=await browser.newPage({reducedMotion:'reduce'});
  await reduced.goto(url);
  assert.equal(await reduced.locator('.lounge-avatar--idle .lounge-robot').first().evaluate(e=>getComputedStyle(e).animationName),'none');
  await reduced.close();
  console.log('PASS: actual lounge sprites, furniture, idle movement, labeled synthetic effects, pause, reduced motion, desktop/375, no POST');
} finally {await browser.close();await server.close()}
