import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createBuilding } from '../src/models.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const building=createBuilding();
assert.equal(building.apartments.length,290);
assert.equal(new Set(building.apartments.map(a=>a.id)).size,290);
assert(building.apartments.every(a=>a.windows===3||a.windows===4));
assert.equal(building.apartments.filter(a=>a.floor===8).length,10);
assert.equal(building.apartments.filter(a=>a.floor===36).length,10);
const errors=[],checks=[];
const base=process.env.DEMO_URL||'http://localhost:5183/demo-v1/';
const executablePath=process.env.CHROME_PATH||(existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined);
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('artifacts',{recursive:true});await mkdir('public/models',{recursive:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
const state=()=>page.evaluate(()=>window.demo1.state);
const stats=()=>page.evaluate(()=>window.demo1.stats);
const settled=()=>page.waitForFunction(()=>window.demo1&&!window.demo1.state.transitioning);
async function pause(ms=850){await page.waitForTimeout(ms);await page.waitForFunction(()=>window.demo1&&!window.demo1.state.cameraAnimating);}
async function point(id){return page.evaluate(id=>window.demo1.projectApartment(id),id);}
async function screenshot(name){await page.screenshot({path:`artifacts/${name}.png`});}
async function saveModel(kind,filename){
 const bytes=await page.evaluate(async kind=>Array.from(new Uint8Array(await window.demo1.exportModel(kind))),kind);
 const buffer=Buffer.from(bytes);assert.equal(buffer.readUInt32LE(0),0x46546c67);
 await writeFile(`public/models/${filename}`,buffer);
 const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 const load={instances:0,meshes:0,apartments:0};
 gltf.scene.traverse(o=>{if(o.isInstancedMesh)load.instances+=o.count;if(o.isMesh)load.meshes++;if(o.userData.apartments)load.apartments+=o.userData.apartments.length;});
 assert(load.instances>0);assert(load.meshes>0);if(kind==='building')assert.equal(load.apartments,290);
 checks.push({check:`Export and GLTFLoader round-trip: ${filename}`,bytes:buffer.length,...load});
}
try{
 // Block all external resources: fonts, images, JS and geometry must be local.
 await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 await page.goto(base);await page.waitForFunction(()=>window.demo1);await pause();
 const initial=await stats();assert.equal(initial.apartments,290);assert(initial.drawCalls<65);
 assert(Math.abs(initial.maxPolar-initial.minPolar-Math.PI/2)<1e-8);
 checks.push({check:'Offline-capable desktop rendering / 90° building orbit',...initial});
 await screenshot('building-desktop');
 const p=await point('A-2002');await page.mouse.move(p.x,p.y);await pause(150);
 assert.equal((await state()).hovered,'A-2002');await expect(page.locator('#hover-tooltip')).toBeVisible();await screenshot('building-hover');
 // Moving across a grouped residence retains its id; dragging must never enter it.
 await page.mouse.down();await page.mouse.move(p.x+100,p.y+15,{steps:15});await page.mouse.up();await pause();assert.equal((await state()).view,'building');
 await page.locator('#reset-view').click();await pause();
 const p2=await point('A-2002');await page.mouse.click(p2.x,p2.y);await settled();
 assert.equal((await state()).view,'apartment');assert.equal((await state()).selected,'A-2002');
 const interior=await stats();assert.equal(interior.minPolar,interior.maxPolar);assert(interior.drawCalls<75);
 await screenshot('apartment-desktop');
 // Horizontal dragging rotates; a simultaneous vertical drag keeps the elevation fixed.
 await page.mouse.move(850,550);await page.mouse.down();await page.mouse.move(1100,300,{steps:20});await page.mouse.up();await pause();
 const rotated=await stats();assert(Math.abs(rotated.polar-interior.polar)<1e-7);assert(Math.abs(rotated.azimuth-interior.azimuth)>.2);
 // More than a complete horizontal revolution is accepted, including past +/- pi.
 await page.locator('#reset-view').click();await pause();const circleStart=await stats();
 await page.locator('#viewport').focus();
 for(let i=0;i<60;i++)await page.keyboard.press('ArrowRight');
 const circled=await stats();assert(Math.abs(circled.polar-interior.polar)<1e-7);
 const expected=Math.atan2(Math.sin(circleStart.azimuth+7.2),Math.cos(circleStart.azimuth+7.2));assert(Math.abs(Math.atan2(Math.sin(circled.azimuth-expected),Math.cos(circled.azimuth-expected)))<.025, JSON.stringify({rotated:rotated.azimuth,circled:circled.azimuth,expected}));
 await page.locator('#zoom-in').click();await pause(300);assert((await stats()).distance<circled.distance);
 await page.locator('#reset-view').click();await pause();await screenshot('apartment-desktop');
 await saveModel('apartment','demo1-apartment-3-windows.glb');
 checks.push({check:'Apartment hover/click, transition, 360° rotation, locked elevation, zoom and reset',...interior});
 await page.keyboard.press('Escape');await settled();assert.equal((await state()).view,'building');
 // Test all four façades via genuine UI, including bottom and top residential floors.
 for(const [floor,number] of [[8,1],[36,4],[20,5],[20,8],[20,10]]){
  await page.locator('#floor-select').selectOption(String(floor));await pause(650);
  const id=`A-${floor}${String(number).padStart(2,'0')}`;await page.locator('#apartment-select').selectOption(id);await pause();
  const pt=await point(id);await page.mouse.move(pt.x,pt.y);await pause(120);assert.equal((await state()).hovered,id,JSON.stringify({id,pt,state:await state(),element:await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML.slice(0,160),pt)}));
 }
 checks.push({check:'Direct apartment picking works on front, rear, both sides, floor 8 and floor 36'});
 await page.locator('#enter-button').click();await settled();assert.equal((await state()).selected,'A-2010');
 await saveModel('apartment','demo1-apartment-4-windows.glb');
 await page.locator('#back-button').click();await settled();
 await saveModel('building','demo1-building.glb');
 await page.locator('#reset-view').click();await pause();
 // Actual vertical controls clamp before either pole.
 await page.locator('#viewport').focus();for(let i=0;i<30;i++)await page.keyboard.press('ArrowUp');
 let angle=await stats();assert(Math.abs(angle.polar-angle.minPolar)<1e-7);
 for(let i=0;i<35;i++)await page.keyboard.press('ArrowDown');angle=await stats();assert(Math.abs(angle.polar-angle.maxPolar)<1e-7);
 await page.locator('#reset-view').click();await pause();
 await page.locator('#auto-rotate').click();const before=await stats();await page.waitForFunction(azimuth=>Math.abs(window.demo1.stats.azimuth-azimuth)>.01,before.azimuth,{timeout:10000});await page.locator('#auto-rotate').click();
 await page.locator('#about-button').click();await expect(page.locator('#about-dialog')).toBeVisible();
 await expect(page.locator('#about-dialog')).toContainText('About demo1');
 assert.equal(await page.locator('#about-dialog img').count(),0);
 const download=page.waitForEvent('download');await page.locator('#export-model').click();const file=await download;assert.equal(file.suggestedFilename(),'demo1-building.glb');
 await page.locator('#close-about').click();
 checks.push({check:'Orbit limits, automatic rotation, demo information and GLB download UI'});
 // Release the desktop WebGL context before software-rendered mobile checks.
 await context.close();
 // Fresh mobile context exercises real touch events (including a two-finger pinch).
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const mp=await mobile.newPage();mp.on('pageerror',e=>errors.push(e.message));await mp.goto(base);await mp.waitForFunction(()=>window.demo1);await mp.waitForTimeout(800);
 assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth),390);
 assert((await mp.evaluate(()=>window.demo1.stats)).pixelRatio<=1.5);
 await mp.screenshot({path:'artifacts/building-mobile.png'});
 const cdp=await mobile.newCDPSession(mp);
 const touches=(spread)=>[{x:195-spread,y:350,id:1},{x:195+spread,y:350,id:2}];
 const startDistance=await mp.evaluate(()=>window.demo1.stats.distance);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches(25)});
 for(let spread=30;spread<=65;spread+=5)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touches(spread)});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mp.waitForTimeout(500);
 assert.equal((await mp.evaluate(()=>window.demo1.state)).view,'building');assert((await mp.evaluate(()=>window.demo1.stats.distance))<startDistance);
 await mp.locator('#reset-view').tap();await mp.waitForTimeout(900);
 const pt=await mp.evaluate(()=>window.demo1.projectApartment('A-2002'));await mp.touchscreen.tap(pt.x,pt.y);
 await mp.waitForFunction(()=>window.demo1.state.view==='apartment'&&!window.demo1.state.transitioning);
 await mp.screenshot({path:'artifacts/apartment-mobile.png'});
 const mobilePolar=await mp.evaluate(()=>window.demo1.stats.polar);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:210,y:370,id:1}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:210+i*10,y:370-i*10,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await mp.waitForTimeout(500);
 assert(Math.abs(await mp.evaluate(()=>window.demo1.stats.polar)-mobilePolar)<1e-7);
 await mp.locator('#back-button').tap();await mp.waitForFunction(()=>window.demo1.state.view==='building'&&!window.demo1.state.transitioning);
 await mp.setViewportSize({width:844,height:390});await mp.waitForTimeout(500);assert.equal(await mp.evaluate(()=>document.documentElement.scrollWidth),844);await mp.screenshot({path:'artifacts/building-landscape.png'});
 await mobile.close();checks.push({check:'Mobile portrait/landscape, DPR cap, touch selection, pinch zoom, drag and return'});
 assert.deepEqual(errors,[]);
 await writeFile('artifacts/validation.json',JSON.stringify({passed:true,checks,browserErrors:errors},null,2));
 console.log(JSON.stringify({passed:true,checks,browserErrors:errors},null,2));
}finally{await browser.close();}
