import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:768,height:1024} });
await page.goto('http://127.0.0.1:4173/login.html', {waitUntil:'load'});
await page.fill('#email','student1@gmail.com');
await page.fill('#password','12345678');
await Promise.all([page.waitForURL(u=>u.pathname.endsWith('/student.html'),{timeout:25000}), page.locator('.submit-btn').click()]);
await page.waitForTimeout(800);
console.log(await page.evaluate(() => {
 const sidebar=document.querySelector('.student-sidebar');
 const batch=document.querySelector('.nav-item[data-view="batch"]');
 const el=document.elementFromPoint(30, 286);
 const data = el ? {tag:el.tagName, id:el.id, cls:String(el.className), text:el.textContent.trim().slice(0,50)} : null;
 return {sidebar:{rect:sidebar.getBoundingClientRect().toJSON(), z:getComputedStyle(sidebar).zIndex, pointer:getComputedStyle(sidebar).pointerEvents}, batch:{rect:batch.getBoundingClientRect().toJSON(), z:getComputedStyle(batch).zIndex, pointer:getComputedStyle(batch).pointerEvents}, top:data};
}));
await page.screenshot({path:'other-than-working-files/proof-screenshots/responsive/tablet-menu-debug.png', fullPage:true});
await browser.close();
