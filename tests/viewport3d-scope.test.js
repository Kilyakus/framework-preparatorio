import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopeRegistry, registerScopeDefinitions } from '../src/app/main.js';
import { createViewport3DScope, VIEWPORT3D_SCOPE } from '../src/studio/scopes/viewport3d/index.js';

class Scene {};
class Camera { constructor() { this.isPerspectiveCamera = true; } updateProjectionMatrix() { this.updated = true; } }
class Renderer {
  constructor() { this.domElement = { remove() { this.removed = true; } }; }
  setPixelRatio(value) { this.ratio = value; }
  setSize(width, height) { this.size = [width, height]; }
  render() { this.draws = (this.draws ?? 0) + 1; }
  dispose() { this.disposals = (this.disposals ?? 0) + 1; }
}
const THREE = {Scene, PerspectiveCamera:Camera, OrthographicCamera:Camera, WebGLRenderer:Renderer};

const custom = Object.freeze({ id:'viewport3d', areaId:'custom', label:'Custom', selector:'#custom', template:'<div id="custom"></div>' });
const engine = Object.freeze({ id:'viewport3d', plugins:{scopeDefinitions:[custom]} });

test('the built-in scope is absent by default and is only created on explicit opt-in', () => {
  assert.equal(createViewport3DScope(), null);
  assert.equal(createViewport3DScope({ enabled: false }), null);
  let registry = createScopeRegistry();
  registerScopeDefinitions(registry);
  assert.deepEqual(registry.list(), []);
  registry = createScopeRegistry();
  registerScopeDefinitions(registry, { builtInScopes: {viewport3d:{enabled:true}} });
  assert.equal(registry.get('viewport3d').template, VIEWPORT3D_SCOPE.template);
  assert.equal(typeof registry.get('viewport3d').activate, 'function');
});

test('explicit scope configuration wraps the host shell without duplicating its id; disabled skips it', () => {
  let registry = createScopeRegistry();
  registerScopeDefinitions(registry, {engines:[engine], builtInScopes:{viewport3d:{enabled:true}}});
  assert.equal(registry.list().length, 1);
  assert.equal(registry.get('viewport3d').selector, '#custom');
  assert.equal(registry.get('viewport3d').template, custom.template);
  assert.throws(()=>createViewport3DScope({enabled:true,scope:{id:'wrong'}}), /id cannot be changed/);
  registry = createScopeRegistry();
  registerScopeDefinitions(registry, {engines:[engine], builtInScopes:{viewport3d:{enabled:false}}});
  assert.deepEqual(registry.list(), []);
  // A legacy application-defined area remains backward compatible if the host
  // does not request the new built-in scope at all.
  registry = createScopeRegistry();
  registerScopeDefinitions(registry, {engines:[engine]});
  assert.equal(registry.get('viewport3d'), custom);
});

test('generic activation uses host THREE, starts registered plugins and disposes the runtime', () => {
  const host={clientWidth:320,clientHeight:180,appendChild(el){el.parentNode=this;this.child=el}};
  const node={querySelector(selector){assert.equal(selector,'[data-viewport3d-container]');return host;}};
  const events=[];
  const scope=createViewport3DScope({enabled:true});
  const dispose=scope.activate({node,viewport3d:{THREE,loop:false,plugins:[{id:'example',activate({defer}){events.push('activate');defer(()=>events.push('dispose'));}}]}});
  const viewport=dispose.viewport3d;
  assert.equal(viewport.THREE,THREE);assert.deepEqual(viewport.renderer.size,[320,180]);
  assert.equal(viewport.camera.aspect,320/180);assert.equal(viewport.camera.updated,true);
  viewport.render();assert.equal(viewport.renderer.draws,1);
  dispose();dispose();assert.deepEqual(events,['activate','dispose']);assert.equal(viewport.renderer.disposals,1);
});

test('generic activation cleans up if plugin setup throws',()=>{
  const host={clientWidth:10,clientHeight:10,appendChild(el){el.parentNode=this;this.child=el}};
  let renderer;
  class Tracked extends Renderer { constructor(...args){super(...args);renderer=this;} }
  const scope=createViewport3DScope({enabled:true});
  assert.throws(()=>scope.activate({node:{querySelector:()=>host},viewport3d:{THREE:{...THREE,WebGLRenderer:Tracked},loop:false,plugins:[{id:'bad',activate(){throw Error('bad')}}]}}),/bad/);
  assert.equal(renderer.disposals,1);assert.equal(host.child.removed,true);
});
