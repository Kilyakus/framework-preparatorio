// Run against the demo server on port 5174.
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
await page.goto('http://localhost:5174/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.demoStudio);
const combo=page.getByRole('combobox',{name:'Категория'});assert.equal(await combo.getAttribute('aria-expanded'),'false');
assert.equal(await combo.textContent(),'Стандартная');assert.match(await page.locator('[data-control-id="category"] .prep-select-description').innerText(),/Универсальные настройки/);
await combo.click();assert.equal(await combo.getAttribute('aria-expanded'),'true');const menu=page.getByRole('listbox',{name:'Категория'});assert.ok(await menu.isVisible());
assert.equal(await menu.locator('.prep-select-group').count(),2);assert.match(await menu.innerText(),/Дополнительные параметры и инструменты/);assert.equal(await menu.getByRole('option',{name:/Стандартная/}).getAttribute('aria-selected'),'true');
await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await combo.textContent(),'Расширенная');assert.equal(await combo.getAttribute('aria-expanded'),'false');assert.match(await page.locator('[data-control-id="category"] .prep-select-description').innerText(),/Дополнительные параметры/);assert.match(await page.locator('#console .b-header-hint').innerText(),/extended/);
await combo.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('End');assert.match(await page.evaluate(()=>document.activeElement.textContent),/Пользовательская/);await page.keyboard.press('Home');assert.match(await page.evaluate(()=>document.activeElement.textContent),/Стандартная/);await page.keyboard.press('Escape');assert.equal(await combo.getAttribute('aria-expanded'),'false');assert.equal(await combo.evaluate(e=>document.activeElement===e),true);
await combo.click();await page.locator('.demo-stage').click({position:{x:12,y:12}});assert.equal(await combo.getAttribute('aria-expanded'),'false');
await combo.click();await page.keyboard.press('Tab');assert.equal(await combo.getAttribute('aria-expanded'),'false');assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY','Tab should continue through the interface');
// The same live control continues working when its tool is detached.
await page.getByRole('button',{name:'Инструменты',exact:true}).click();await page.getByLabel('Отделить или перетащить «Образ»').click();await page.waitForTimeout(150);assert.equal(await combo.textContent(),'Расширенная');await combo.click();assert.ok(await menu.isVisible());await page.keyboard.press('Escape');await page.getByLabel('Вернуть «Образ»').click();
// Standalone API: validation, programmatic updates, disabled choices, escaping and cleanup.
const result=await page.evaluate(async()=>{
 const {createCustomSelect,getCustomSelect}=await import('/assets/js/main.js');window._changes=[];
 const s=createCustomSelect({label:'Standalone',value:'disabled',options:[{value:'disabled',label:'Недоступно',disabled:true},{value:'safe',label:'<strong>text</strong>',description:'<img src=x onerror=alert(1)>'},{value:'other',label:'Другой'}],onChange:(value)=>window._changes.push(value)});
 document.body.append(s.element);window._select=s;return {initial:s.value,html:s.trigger.innerHTML,description:s.description.textContent,lookup:getCustomSelect(s.element)===s};
});
assert.equal(result.initial,'safe');assert.equal(result.description,'<img src=x onerror=alert(1)>');assert.ok(!result.html.includes('<strong>'));assert.equal(result.lookup,true);
await page.getByRole('combobox',{name:'Standalone'}).click();assert.equal(await page.getByRole('option',{name:'Недоступно'}).isDisabled(),true);assert.equal(await page.locator('.prep-select-option-description img').count(),0);
await page.getByRole('option',{name:'Другой'}).click();assert.deepEqual(await page.evaluate(()=>window._changes),['other']);
assert.equal(await page.evaluate(()=>_select.setValue('safe')),true);assert.deepEqual(await page.evaluate(()=>window._changes),['other']);
assert.equal(await page.evaluate(()=>_select.setValue('other',{notify:true})),true);assert.deepEqual(await page.evaluate(()=>window._changes),['other','other']);
await page.evaluate(()=>_select.setOptions({groups:[{label:'Новая группа',options:[{value:'new',label:'Новое',description:'Новое описание'}]}]}));assert.equal(await page.evaluate(()=>_select.value),'new');
await page.evaluate(()=>_select.setDisabled(true));assert.equal(await page.getByRole('combobox',{name:'Standalone'}).isDisabled(),true);await page.evaluate(()=>{_select.setDisabled(false);_select.open()});assert.equal(await page.getByRole('listbox',{name:'Standalone'}).isVisible(),true);
await page.evaluate(()=>_select.destroy());assert.equal(await page.getByRole('listbox',{name:'Standalone'}).count(),0);assert.equal(await page.getByRole('combobox',{name:'Standalone'}).count(),0);
// Popup near the bottom must flip above and remain inside the viewport.
const coords=await page.evaluate(async()=>{const {createCustomSelect}=await import('/assets/js/main.js');const s=createCustomSelect({label:'Bottom',options:Array.from({length:20},(_,i)=>({value:String(i),label:`Вариант ${i}`,description:`Описание ${i}`}))});s.element.style.cssText='position:fixed;right:5px;bottom:4px;width:160px';document.body.append(s.element);s.open();const a=s.trigger.getBoundingClientRect().toJSON(),b=s.menu.getBoundingClientRect().toJSON();s.destroy();return {a,b,w:innerWidth,h:innerHeight}});
assert.ok(coords.b.bottom<=coords.a.top&&coords.b.top>=0&&coords.b.right<=coords.w,JSON.stringify(coords));
assert.deepEqual(errors,[]);console.log('Custom select: descriptions, groups, keyboard, portals, dynamic updates and disposal passed');await browser.close();
