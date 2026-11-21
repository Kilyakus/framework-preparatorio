import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {JSDOM} from 'jsdom';
import {VIEWPORT3D_TEMPLATE,mountViewportChrome} from '../src/studio/scopes/viewport3d/index.js';
import {registerViewportContribution} from '../src/studio/contributions/view-contributions.js';

function setup(){
  const dom=new JSDOM(`<!doctype html><body>${VIEWPORT3D_TEMPLATE}<div id="origin"><div id="custom" class="tab-content active" role="tabpanel"><button>Тест</button></div></div></body>`,{pretendToBeVisual:true});
  const doc=dom.window.document,root=doc.querySelector('.v3d-scope');
  const oldAbort=globalThis.AbortController;globalThis.AbortController=dom.window.AbortController;
  const ui={syncRangeFill(){},createCustomSelect(){
    const element=doc.createElement('div'),trigger=doc.createElement('button'),menu=doc.createElement('div');element.append(trigger,menu);
    return {element,trigger,menu,value:'',setOptions(){},setValue(v){this.value=v;},setDisabled(v){trigger.disabled=v;},close(){},destroy(){element.remove();}};
  }};
  const renderer={capabilities:{},shadowMap:{enabled:false},getPixelRatio:()=>1,setPixelRatio(){}};
  const disposers=new Set();
  const viewport={THREE,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),renderer,container:root,
    onDispose(fn){disposers.add(fn);return ()=>disposers.delete(fn);},onRender(){return ()=>{};}};
  const button=root.querySelector('[data-v3d-graphics-toggle]');
  button.getBoundingClientRect=()=>({top:10,bottom:34,left:260,right:284});
  button.getClientRects=()=>[button.getBoundingClientRect()];
  const chrome=mountViewportChrome({root,viewport,ui});
  return {dom,doc,root,button,chrome,done(){chrome.dispose();globalThis.AbortController=oldAbort;dom.window.close();}};
}

test('default icon opens grouped settings; outside click, Escape and disposal work',()=>{
  const t=setup();try{
    const {doc,root,button,chrome}=t,panel=doc.querySelector('[data-v3d-graphics-panel]');
    assert.equal(button.textContent.trim(),'');assert(button.querySelector('svg'));
    assert.equal(button.getAttribute('aria-label'),'Дополнительные настройки просмотра');
    assert.equal(button.getAttribute('aria-controls'),panel.id);assert.equal(panel.parentNode,doc.body);
    assert.deepEqual([...panel.querySelectorAll('[data-v3d-section]')].map(node=>node.dataset.v3dSection),['environment','display','graphics']);
    button.click();assert.equal(panel.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
    const graphics=panel.querySelector('[data-v3d-section-toggle="graphics"]');graphics.click();assert.equal(graphics.getAttribute('aria-expanded'),'false');
    doc.dispatchEvent(new t.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(panel.hidden,true);
    button.click();doc.body.dispatchEvent(new t.dom.window.Event('pointerdown',{bubbles:true}));assert.equal(panel.hidden,true);
    chrome.dispose();assert.equal(panel.parentElement.className,'v3d-graphics-menu');assert.equal(button.hasAttribute('aria-controls'),false);
    assert.equal(root.querySelector('[data-v3d-section]'),null);
  }finally{t.done();}
});

test('registered contributions dynamically form ordered groups and restore original nodes',async()=>{
  const t=setup();let removeA,removeB;try{
    const {doc,chrome}=t,source=doc.querySelector('#custom');
    removeA=registerViewportContribution({id:'example-menu-item',label:'Дополнительно',selector:'#custom',order:20,owner:'example'});
    const host=doc.querySelector('[data-v3d-contributions]'),group=host.querySelector('[data-menu-contribution="example-menu-item"]');
    assert(group);assert.equal(group.style.order,'20');assert.equal(group.querySelector('strong').textContent,'Дополнительно');assert(group.contains(source));assert.equal(source.getAttribute('role'),'group');
    removeB=registerViewportContribution({id:'late-menu-item',label:'Поздний',selector:'#late',order:10});
    const late=doc.createElement('div');late.id='late';doc.body.append(late);
    await new Promise(resolve=>t.dom.window.setTimeout(resolve,0));
    assert.equal(host.querySelector('[data-menu-contribution="late-menu-item"]').style.order,'10');
    removeA();assert.equal(source.parentElement.id,'origin');assert.equal(source.getAttribute('role'),'tabpanel');assert(source.classList.contains('tab-content'));assert(source.classList.contains('active'));
    chrome.dispose();assert.equal(late.parentNode,doc.body);assert.equal(host.isConnected,false);
  }finally{removeA?.();removeB?.();t.done();}
});
