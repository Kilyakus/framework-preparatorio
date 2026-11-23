// Run against the five running dev servers. Browser contexts are isolated so
// saved user graphics/grid preferences cannot influence the default checks.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const ready={evolvia:()=>document.querySelector('[data-app-ready=true]')&&window.__sphereDebug?.view,
 physio:()=>document.querySelector('[data-app-ready=true]'),animio:()=>window.Animio?.actor,
 prismia:()=>window.__prismiaDebug?.runtime?.renderer?.info.render.frame>0,
 morphia:()=>window.Morphia?.engine?.bodyRoot};
(async()=>{const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 for(const [name,port] of Object.entries({evolvia:5175,physio:5177,animio:5178,prismia:5176,morphia:5180})){
  const p=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(`http://localhost:${port}/?debug=1`);await p.waitForFunction(ready[name],null,{timeout:90000});
  const geometry=await p.evaluate(()=>{const s=document.querySelector('[data-v3d-stage]').getBoundingClientRect(),t=document.querySelector('[data-v3d-tool-host]').getBoundingClientRect(),g=document.querySelector('[data-v3d-gizmo]').getBoundingClientRect();return {tool:[t.top-s.top,t.left-s.left,t.width],gizmo:[g.top-s.top,s.right-g.right]}});
  assert.deepEqual(geometry,{tool:[10,10,51],gizmo:[10,12]},name);
  if(name==='morphia'){
   const status=p.locator('[data-v3d-status] [data-v3d-status-item=shadow-quality]');assert(await status.isVisible());assert.equal(await p.locator('.b-topbar #shadowQuality').count(),0);assert.match(await status.textContent(),/^Тени \d+²$/);
   await p.locator('[data-v3d-graphics-toggle]').click();await p.locator('[data-v3d-select-slot=shadow] [role=combobox]').click();await p.locator('[role=option][data-value=off]').evaluate(el=>el.click());await p.waitForFunction(()=>document.querySelector('[data-v3d-status-item=shadow-quality]').textContent==='Тени выкл');
   await p.locator('[data-v3d-select-slot=shadow] [role=combobox]').click();await p.locator('[role=option][data-value="1024"]').evaluate(el=>el.click());await p.waitForFunction(()=>document.querySelector('[data-v3d-status-item=shadow-quality]').textContent==='Тени 1024²');assert.match(await status.getAttribute('title'),/предел устройства/);
  }
  assert.deepEqual(errors,[],name);await p.close();console.log('PASS',name,geometry);
 }
 for(const width of [1280,390]){
  const p=await browser.newPage({viewport:{width,height:800},isMobile:width===390,hasTouch:width===390}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://localhost:5175/?debug=1');await p.waitForFunction(ready.evolvia,null,{timeout:90000});
  const select=p.locator('[data-v3d-object-host] [role=combobox]');assert(await select.isVisible());assert.equal((await select.textContent()).trim(),'Сфера');
  const defaults=await p.evaluate(()=>({grid:__sphereDebug.viewportEnvironment.grid.visible,pedestal:!!__sphereDebug.viewport3d.scene.getObjectByName('StudioPedestal'),shadow:!!document.querySelector('.ground-shadow')}));assert.deepEqual(defaults,{grid:false,pedestal:false,shadow:false});
  await select.click();assert.equal(await p.locator('[role=option]').count(),3);await p.getByRole('option',{name:/Манекен/}).click();await p.waitForFunction(()=>__sphereDebug.display.value.mode==='mannequin'&&!__sphereDebug.display.value.busy&&__sphereDebug.view.subject?.name==='MannequinRig',null,{timeout:90000});assert.match(await select.textContent(),/Манекен/);
  await p.evaluate(()=>__sphereDebug.display.setMode('sphere'));assert.match(await select.textContent(),/Сфера/);
  if(width===1280){await select.click();await p.getByRole('option',{name:/Персонаж AB3/}).click();await p.waitForFunction(()=>__sphereDebug.display.value.mode==='character-ab3'&&!__sphereDebug.display.value.busy&&__sphereDebug.view.subject,null,{timeout:120000});assert.equal(await p.evaluate(()=>__sphereDebug.display.value.error),null);}
  await p.evaluate(()=>__sphereDebug.viewportEnvironment.set('studio',{force:true}));assert.equal(await p.evaluate(()=>!!__sphereDebug.viewport3d.scene.getObjectByName('StudioPedestal')),false);
  assert.deepEqual(errors,[]);await p.close();console.log('PASS Evolvia selection, state synchronization and floorless default',width);
 }
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
