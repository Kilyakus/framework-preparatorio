import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import * as THREE from 'three';
import {composeViewportStatus,mountViewportStatus,VIEWPORT3D_STATUS_DEFAULTS,VIEWPORT3D_TEMPLATE,createViewport3D} from '../src/studio/scopes/viewport3d/index.js';

test('cascade merges by id and groups, supports removal, validates malformed layers',()=>{
 const spec=composeViewportStatus(VIEWPORT3D_STATUS_DEFAULTS,{groups:[{id:'info',row:1,side:'right',order:9}],items:[{id:'fps',group:'info',order:2},{id:'position',remove:true},{id:'extra',group:'info',order:1,text:'Extra'}]},
 {groups:[{id:'info',side:'left'}],items:[{id:'fps',title:'Custom'}]});
 assert.equal(spec.groups[0].row,1);assert.equal(spec.groups[0].side,'left');
 assert.equal(spec.items.length,2);assert.equal(typeof spec.items[0].text,'function');assert.equal(spec.items[0].title,'Custom');
 assert.throws(()=>composeViewportStatus({items:[{id:'a'},{id:'a'}]}),/duplicate/);
 assert.throws(()=>composeViewportStatus({items:[{id:'a',group:'unknown'}]}),/unknown group/);
 assert.throws(()=>composeViewportStatus({items:[{id:'a',side:'top'}]}),/side/);
});

test('status lays out ordered rows, sides and groups, computes real fps and world XYZ and cleans up',()=>{
 const dom=new JSDOM(`<body>${VIEWPORT3D_TEMPLATE}</body>`),root=dom.window.document.querySelector('[data-v3d-status]');
 root.innerHTML='<em>original</em>';let time=0;const hooks=new Set(), selection=new Set(),disposeHooks=new Set();
 const viewport={THREE,activeObject:null,onRender(fn){hooks.add(fn);return()=>hooks.delete(fn)},onActiveObjectChange(fn){selection.add(fn);return()=>selection.delete(fn)},onDispose(fn){disposeHooks.add(fn);return()=>disposeHooks.delete(fn)}};
 const status=mountViewportStatus({root,viewport,now:()=>time,interval:0,layers:[{groups:[{id:'common',row:1,side:'left',order:10,separator:' / '}],items:[{id:'b',group:'common',order:20,text:'B'},{id:'a',group:'common',order:10,text:'A'},{id:'tip',row:1,side:'right',text:'Tip'}]}]});
 assert.equal(root.querySelector('[data-v3d-status-item=position]').textContent,'XYZ —');
 assert.equal(root.querySelector('[data-v3d-status-item=fps]').textContent,'FPS —');
 assert.equal(root.querySelector('[data-v3d-status-group=common]').textContent,'A / B');
 assert.equal(root.querySelector('[data-v3d-status-row="1"] [data-v3d-status-side=right]').textContent,'Tip');
 const parent=new THREE.Object3D(),child=new THREE.Object3D();parent.position.set(4,2,-1);child.position.set(1,3,0);parent.add(child);viewport.activeObject=child;for(const f of selection)f();
 assert.equal(root.querySelector('[data-v3d-status-item=position]').textContent,'XYZ 5.00  5.00  -1.00');
 for(let i=1;i<=10;i++){time=i*100;for(const f of hooks)f();}
 assert.equal(root.querySelector('[data-v3d-status-item=fps]').textContent,'FPS 10');
 const off=status.addLayer({items:[{id:'fps',enabled:false},{id:'c',group:'common',order:15,text:'C'}]});
 assert.equal(root.querySelector('[data-v3d-status-item=fps]'),null);assert.equal(root.querySelector('[data-v3d-status-group=common]').textContent,'A / C / B');
 assert.throws(()=>status.addLayer({items:[{id:'bad',group:'missing'}]}),/unknown/);assert.equal(status.config.items.some(i=>i.id==='bad'),false);
 assert.equal(off(),true);assert.equal(off(),false);assert(root.querySelector('[data-v3d-status-item=fps]'));
 for(const f of [...disposeHooks])f();status.dispose();assert.equal(root.innerHTML,'<em>original</em>');assert.equal(hooks.size,0);assert.equal(selection.size,0);assert.equal(disposeHooks.size,0);dom.window.close();
});

test('viewport selection API is observable and released on dispose',()=>{
 const renderer={domElement:{},setPixelRatio(){},setSize(){},render(){}};
 const viewport=createViewport3D({THREE,renderer});const values=[];const off=viewport.onActiveObjectChange(v=>values.push(v));const object=new THREE.Object3D();
 assert.equal(viewport.setActiveObject(object),true);assert.equal(viewport.activeObject,object);assert.equal(viewport.setActiveObject(object),false);
 viewport.setActiveObject(null);off();viewport.setActiveObject(object);assert.deepEqual(values,[object,null]);assert.throws(()=>viewport.setActiveObject('bad'),/object/);viewport.dispose();assert.equal(viewport.activeObject,null);
});

test('standard scope mounts default status automatically, custom layers and opt out',async()=>{
 const {activateViewport3DScope}=await import('../src/studio/scopes/viewport3d/index.js');
 const dom=new JSDOM('<section><div data-viewport3d-container></div><footer data-v3d-status></footer></section>');
 const root=dom.window.document.querySelector('section'),host=root.querySelector('[data-viewport3d-container]');
 const renderer={domElement:dom.window.document.createElement('canvas'),setSize(){},setPixelRatio(){},render(){}};
 let handle=activateViewport3DScope({node:root,viewport3d:{THREE,loop:false,options:{renderer},status:{layers:[{items:[{id:'example',text:'Ready'}]}]}}});
 assert.equal(root.querySelector('[data-v3d-status-item=example]').textContent,'Ready');assert(root.querySelector('[data-v3d-status-item=fps]'));assert(handle.status);
 handle();assert.equal(root.querySelector('[data-v3d-status]').childNodes.length,0);
 handle=activateViewport3DScope({node:root,viewport3d:{THREE,loop:false,options:{renderer},status:false}});assert.equal(handle.status,null);assert.equal(root.querySelector('[data-v3d-status-item=fps]'),null);handle();dom.window.close();
});
