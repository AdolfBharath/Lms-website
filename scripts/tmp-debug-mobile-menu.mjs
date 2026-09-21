import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:375,height:812} });
await page.goto('http://127.0.0.1:4173/login.html', {waitUntil:'load'});
await page.fill('#email','student1@gmail.com');
await page.fill('#password','12345678');
await Promise.all([page.waitForURL(u=>u.pathname.endsWith('/student.html'),{timeout:25000}), page.locator('.submit-btn').click()]);
await page.locator('#studentMenuBtn').click();
await page.waitForTimeout(500);
console.log(await page.evaluate(() => {
 const sidebar=document.querySelector('.student-sidebar');
 const scrim=document.querySelector('#studentSidebarScrim');
 const batch=document.querySelector('.nav-item[data-view="batch"]');
 const el=document.elementFromPoint(40, 285);
 const data = el ? {tag:el.tagName, id:el.id, cls:String(el.className), text:el.textContent.trim().slice(0,50)} : null;
 return {sidebar:{rect:sidebar.getBoundingClientRect().toJSON(), z:getComputedStyle(sidebar).zIndex, pointer:getComputedStyle(sidebar).pointerEvents}, scrim:{rect:scrim.getBoundingClientRect().toJSON(), z:getComputedStyle(scrim).zIndex, pointer:getComputedStyle(scrim).pointerEvents}, batch:{rect:batch.getBoundingClientRect().toJSON(), z:getComputedStyle(batch).zIndex}, top:data};
}));
await page.screenshot({path:'other-than-working-files/proof-screenshots/responsive/mobile-menu-debug.png', fullPage:true});
await browser.close();
