import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {JSDOM} from 'jsdom';
import {VIEWPORT3D_TEMPLATE} from '../src/studio/scopes/viewport3d/index.js';
import {createViewportOrbit} from '../src/studio/scopes/viewport3d/index.js';
import {mountViewportNavigation} from '../src/studio/scopes/viewport3d/index.js';
import {mountViewportGizmo} from '../src/studio/scopes/viewport3d/index.js';

function setup(orthographic=false) {
  const dom=new JSDOM(VIEWPORT3D_TEMPLATE,{pretendToBeVisual:true}),doc=dom.window.document,root=doc.querySelector('.v3d-scope');
  // jsdom requires its own AbortSignal for DOM listeners.
  const old=globalThis.AbortController;globalThis.AbortController=dom.window.AbortController;
  const canvas=doc.createElement('canvas');root.querySelector('[data-viewport3d-container]').append(canvas);
  const camera=orthographic?new THREE.OrthographicCamera(-4,4,3,-3,.1,100):new THREE.PerspectiveCamera(45,1,.1,100);
  camera.position.set(0,0,10);camera.lookAt(0,0,0);
  const scene=new THREE.Scene(),hooks=new Set();let invalidations=0;
  const viewport={THREE,camera,canvas,scene,onRender(fn){hooks.add(fn);return ()=>hooks.delete(fn);}};
  const orbit=createViewportOrbit(viewport,{onChange(){nav?.sync();}});
  let nav=mountViewportNavigation({root,viewport,orbit,invalidate:()=>invalidations++});
  const gizmo=mountViewportGizmo({host:root.querySelector('[data-v3d-gizmo]'),THREE,camera,setView:nav.setView,subscribe:fn=>viewport.onRender(fn)});
  return {doc,root,camera,scene,orbit,nav,gizmo,hooks,invalidations:()=>invalidations,done(){gizmo.dispose();nav.dispose();orbit.dispose();globalThis.AbortController=old;dom.window.close();}};
}
const click=(root,selector)=>root.querySelector(selector).click();

test('gizmo and camera buttons track, navigate and clean up independently',()=>{
  const t=setup();try {
    const {root,camera,nav,gizmo,hooks}=t,button=root.querySelector('[data-v3d-zoom-reset]');
    assert.equal(button.textContent,'100%');
    click(root,'[data-v3d-zoom-in]');assert.equal(button.textContent,'115%');
    click(root,'[data-v3d-zoom-reset]');assert.equal(button.textContent,'100%');
    click(root,'[data-gizmo-view="right"]');assert(camera.position.x>9.9);
    click(root,'[data-gizmo-view="top"]');assert(camera.position.y>9.9);
    click(root,'[data-gizmo-center]');assert(camera.position.x>0&&camera.position.y>0&&camera.position.z>0);
    for(const fn of hooks)fn();
    assert.match(root.querySelector('[data-gizmo-view="front"]').style.transform,/translate/);
    gizmo.dispose();gizmo.dispose();assert.equal(root.querySelectorAll('[data-gizmo-view]').length,0);
    nav.dispose();nav.dispose();assert.equal(hooks.size,0);
    const before=camera.position.clone();click(root,'[data-v3d-zoom-in]');assert(camera.position.equals(before));
  } finally {t.done();}
});

test('fit ignores built-in grid and hidden objects; zoom reset handles extreme perspective and orthographic values',()=>{
  for(const ortho of [false,true]){const t=setup(ortho);try {
    const {root,scene,camera,orbit,nav}=t;
    const grid=new THREE.Mesh(new THREE.BoxGeometry(1000,1,1000));grid.userData.baseMap='studio';scene.add(grid);
    const model=new THREE.Mesh(new THREE.BoxGeometry(2,2,2));model.position.x=5;scene.add(model);
    const hidden=new THREE.Mesh(new THREE.BoxGeometry(200,200,200));hidden.visible=false;scene.add(hidden);
    assert.equal(nav.fit(),true);assert(Math.abs(orbit.target.x-5)<1e-6);
    assert.equal(root.querySelector('[data-v3d-zoom-reset]').textContent,'100%');
    if(ortho)camera.zoom=100;else camera.position.copy(orbit.target).add(new THREE.Vector3(0,0,.05));
    click(root,'[data-v3d-zoom-reset]');assert.equal(root.querySelector('[data-v3d-zoom-reset]').textContent,'100%');
  }finally{t.done();}}
});

test('keyboard, disabled state and fullscreen target',()=>{
  const t=setup();try {
    const {root,doc,camera}=t,stage=root.querySelector('[data-v3d-stage]');let called=0;
    stage.requestFullscreen=()=>{called++;return Promise.resolve();};
    click(root,'[data-v3d-fullscreen]');assert.equal(called,1);
    root.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',{code:'Numpad1',bubbles:true,cancelable:true}));assert(camera.position.z>0&&Math.abs(camera.position.x)<1e-8);
    root.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',{code:'Numpad3',ctrlKey:true,bubbles:true,cancelable:true}));assert(camera.position.x<0);
  }finally{t.done();}
});

test('gizmo instances are independent and respect the enabled gate',()=>{
  const t=setup();try {
    const host=t.root.querySelector('[data-v3d-gizmo]'),other=host.cloneNode(false);
    other.innerHTML='<button data-gizmo-center>perspective</button>';t.root.append(other);
    let enabled=false,views=[];
    const extra=mountViewportGizmo({host:other,THREE,camera:t.camera,isEnabled:()=>enabled,setView:v=>views.push(v)});
    click(other,'[data-gizmo-view="right"]');click(other,'[data-gizmo-center]');assert.deepEqual(views,[]);
    enabled=true;click(other,'[data-gizmo-view="right"]');click(other,'[data-gizmo-center]');assert.deepEqual(views,['right','persp']);
    extra.dispose();assert.equal(other.querySelectorAll('[data-gizmo-view]').length,0);assert.equal(host.querySelectorAll('[data-gizmo-view]').length,3);
  }finally{t.done();}
});

test('programmatic orbit remains usable when input is disabled',()=>{
  const t=setup();try {
    const disabled=createViewportOrbit({THREE,camera:t.camera,canvas:t.orbit? t.root.querySelector('canvas'):null},{input:false});
    const before=t.camera.position.clone();
    // The disabled controller creates no input handlers of its own.
    disabled.zoom(.5);assert(t.camera.position.distanceTo(disabled.target)<before.distanceTo(disabled.target));disabled.dispose();
  }finally{t.done();}
});
