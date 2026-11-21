import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewport3D,VIEWPORT3D_ID} from '../src/studio/scopes/viewport3d/index.js';

class Scene { constructor(){this.objects=[]} add(object){this.objects.push(object)} }
class Camera {constructor(...args){this.args=args}}
class Renderer {
  constructor(options){this.options=options;this.domElement=options.canvas??{remove(){this.removed=true}};this.shadowMap={};this.count=0}
  setPixelRatio(value){this.ratio=value}
  setSize(...args){this.size=args}
  render(scene,camera){this.draw=[scene,camera];this.count++}
  setAnimationLoop(fn){this.loop=fn}
  dispose(){this.disposed=(this.disposed||0)+1}
}
const THREE={Scene,PerspectiveCamera:Camera,OrthographicCamera:Camera,WebGLRenderer:Renderer};
const container=()=>({clientWidth:320,clientHeight:180,children:[],appendChild(el){this.children.push(el);el.parentNode=this}});

test('viewport owns scene, injected renderer and camera, sizes, frame and attached canvas',()=>{
 const host=container(),vp=createViewport3D({THREE,container:host,cameraOptions:{kind:'orthographic',args:[-1,1,1,-1,.1,100]},pixelRatio:1.5});
 assert.equal(vp.id,VIEWPORT3D_ID);assert.equal(vp.THREE,THREE);assert.deepEqual(vp.camera.args,[-1,1,1,-1,.1,100]);
 assert.equal(vp.renderer.ratio,1.5);assert.equal(host.children[0],vp.canvas);
 const order=[];vp.onResize(({width,height})=>order.push(['before',width,height]),{phase:'before'});
 vp.onResize(()=>order.push(['after',...vp.renderer.size]));vp.resize();
 assert.deepEqual(order,[['before',320,180],['after',320,180,false]]);
 vp.start(()=>vp.render(),{driver:'renderer'});vp.renderer.loop();assert.equal(vp.renderer.count,1);
 vp.dispose();vp.dispose();assert.equal(vp.renderer.loop,null);assert.equal(vp.renderer.disposed,1);assert.equal(vp.canvas.removed,true);
 assert.throws(()=>vp.resize(),/disposed/);
});
test('borrowed renderer and pre-existing canvas remain owned by the host',()=>{
 const host=container(),canvas={remove(){throw Error('must not remove')}};
 const renderer=new Renderer({canvas});const vp=createViewport3D({THREE,container:host,canvas,renderer});
 vp.resize();vp.dispose();assert.equal(renderer.disposed,undefined);assert.deepEqual(host.children,[]);
});
test('missing scopes/APIs and plugin dependencies gate, teardown and restart in order',()=>{
 const events=[],host=container(),vp=createViewport3D({THREE,container:host,scopes:['viewport3d']});
 const dependency={id:'base',requires:{scopes:['editor'],apis:['model']},activate({apis,defer,signal}){
   events.push(`base+${apis.model}`);defer(()=>events.push(`base-:${signal.aborted}`));return {api:{value:apis.model}};
 }};
 const dependent={id:'child',requires:{plugins:['base']},activate({viewport}){
   events.push(`child+${viewport.getPlugin('base').value}`);return {api:'child',dispose:()=>events.push('child-')};
 }};
 vp.registerPlugins([dependent,dependency]);assert.deepEqual(vp.listPlugins().map(x=>x.active),[false,false]);
 vp.setApi('model',1);assert.deepEqual(events,[]);vp.setScopeAvailable('editor',true);
 assert.deepEqual(events,['base+1','child+1']);assert.equal(vp.getPlugin('child'),'child');
 vp.setApi('unrelated',100);assert.equal(events.length,2);
 vp.setApi('model',2);assert.deepEqual(events.slice(2),['child-','base-:true','base+2','child+2']);
 vp.setScopeAvailable('editor',false);assert.deepEqual(events.slice(-2),['child-','base-:true']);
 vp.setScopeAvailable('editor',true);vp.unregisterPlugin('base');assert.equal(vp.getPlugin('child'),null);
 assert.deepEqual(events.slice(-2),['child-','base-:true']);vp.dispose();
});
test('duplicates, cycles, partial activation failure roll back without leaks',()=>{
 const events=[],vp=createViewport3D({THREE,container:container()});
 vp.registerPlugin({id:'ok',activate(){events.push('ok+');return ()=>events.push('ok-')}});
 assert.throws(()=>vp.registerPlugin({id:'ok',activate(){}}),/Duplicate/);
 assert.throws(()=>vp.registerPlugin({id:'bad-requires',requires:'graph',activate(){}}),/requires must be an object/);
 assert.throws(()=>vp.registerPlugin({id:'bad-scopes',requires:{scopes:'graph'},activate(){}}),/dependencies must be arrays/);
 assert.throws(()=>vp.registerPlugins([{id:'x',requires:{plugins:['y']},activate(){}},{id:'y',requires:{plugins:['x']},activate(){}}]),/cycle/);
 assert.throws(()=>vp.registerPlugins([{id:'temporary',activate(){events.push('temp+');return ()=>events.push('temp-')}},{id:'broken',activate({defer}){defer(()=>events.push('broken-'));throw Error('bad')}}]),/bad/);
 assert.deepEqual(events,['ok+','temp+','broken-','temp-']);assert.deepEqual(vp.listPlugins().map(x=>x.id),['ok']);vp.dispose();assert.equal(events.at(-1),'ok-');
});
test('zero-size views can defer resizing, and failed activation restores API and plugin',()=>{
 const host=container();host.clientWidth=0;let value=1,disposeCount=0;
 const vp=createViewport3D({THREE,container:host,ignoreZeroSize:true,apis:{data:1}});
 assert.equal(vp.resize(),false);assert.equal(vp.renderer.size,undefined);
 vp.registerPlugin({id:'data-view',requires:{apis:['data']},activate({apis,defer}){defer(()=>disposeCount++);if(apis.data===2)throw Error('bad data');value=apis.data;return {api:value}}});
 assert.throws(()=>vp.setApi('data',2),/bad data/);assert.equal(vp.getPlugin('data-view'),1);assert.equal(disposeCount,2);
 host.clientWidth=10;assert.equal(vp.resize(),true);vp.dispose();
});
test('renderer fallback preserves the first WebGL failure if both attempts fail',()=>{
 const first=new Error('original'),attempts=[];
 class Broken extends Renderer{constructor(opts){attempts.push(opts.antialias);throw attempts.length===1?first:new Error('retry')}}
 assert.throws(()=>createViewport3D({THREE:{...THREE,WebGLRenderer:Broken},container:container(),rendererOptions:{antialias:true},retryWithoutAntialias:true}),error=>error===first);
 assert.deepEqual(attempts,[true,false]);
});


test('canvas-only resize and reentrant dispose do not remove borrowed resources',()=>{
 const canvas={clientWidth:250,clientHeight:100,remove(){throw Error('host canvas')}};
 const renderer=new Renderer({canvas});const vp=createViewport3D({THREE,canvas,renderer});
 vp.resize();assert.deepEqual(renderer.size,[250,100,false]);let cleanup=0;
 vp.registerPlugin({id:'recursive',activate(){return ()=>{cleanup++;vp.dispose()}}});
 vp.dispose();assert.equal(cleanup,1);assert.equal(renderer.disposed,undefined);
});
test('restarting the same RAF callback inside itself never duplicates the loop',()=>{
 const originalRequest=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
 const callbacks=new Map();let id=0;
 globalThis.requestAnimationFrame=callback=>{callbacks.set(++id,callback);return id};
 globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
 try {
  const vp=createViewport3D({THREE,container:container()});let calls=0;
  const callback=()=>{calls++;if(calls===1)vp.start(callback)};vp.start(callback);
  const [firstId,first]=callbacks.entries().next().value;callbacks.delete(firstId);first(0);
  assert.equal(calls,1);assert.equal(callbacks.size,1);
  const [secondId,second]=callbacks.entries().next().value;callbacks.delete(secondId);second(16);
  assert.equal(calls,2);assert.equal(callbacks.size,1);vp.dispose();assert.equal(callbacks.size,0);
 } finally {
  if(originalRequest)globalThis.requestAnimationFrame=originalRequest;else delete globalThis.requestAnimationFrame;
  if(originalCancel)globalThis.cancelAnimationFrame=originalCancel;else delete globalThis.cancelAnimationFrame;
 }
});

test('a render pipeline has exclusive ownership and cleans up without removing a successor',()=>{
 const viewport=createViewport3D({THREE,container:container()});let calls=0;
 const off=viewport.setRenderPipeline(({viewport,scene,camera})=>{calls++;viewport.renderer.render(scene,camera)});
 assert.throws(()=>viewport.setRenderPipeline(()=>{}),/already installed/);viewport.render();assert.equal(calls,1);
 off();const next=viewport.setRenderPipeline(()=>{calls+=10});off();viewport.render();assert.equal(calls,11);
 next();viewport.render();assert.equal(calls,11);viewport.dispose();
});
