import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverViewportEnvironments,normalizeViewportEnvironment,createViewportEnvironments,
  createViewportDisplay,contributeStudioGrid,viewportRendererInfo,BASE_MAP_ID} from '../src/studio/scopes/viewport3d/index.js';

const load=async()=>({mount(){}});
test('shared Vite catalogue discovers validated manifests, reserves Studio and orders plugins',()=>{
  const manifests={
    '/worlds/a/manifest.json':{kind:'world',id:'a',order:10},
    '/worlds/b/manifest.json':{kind:'environment',id:'b',order:2,entry:'world.js'},
    '/worlds/c/manifest.json':{kind:'world',id:'studio'},
    '/worlds/d/manifest.json':{kind:'world',id:'d',entry:'../escape.js'},
    '/worlds/e/manifest.json':{kind:'world',id:'e'},
    '/worlds/f/manifest.json':{kind:'other',id:'f'},
    '/worlds/g/manifest.json':{kind:'world',id:'g',order:5,entry:'room.js'},
  };
  const entries=Object.fromEntries(['a','b','c','d','f'].map(id=>[`/worlds/${id}/world.js`,load]));
  entries['/worlds/g/room.js']=load;
  assert.deepEqual(discoverViewportEnvironments({manifests,entries}).map(item=>item.id),['b','g','a']);
  assert.throws(()=>normalizeViewportEnvironment({id:'studio',load}),/reserved/);
  assert.throws(()=>normalizeViewportEnvironment({id:'Studio',load}),/reserved/);
  assert.equal(normalizeViewportEnvironment({id:'studio',load},{builtIn:true}).builtIn,true);
  assert.throws(()=>discoverViewportEnvironments({manifests:{'/x/manifest.json':{kind:'world',id:'x'},'/y/manifest.json':{kind:'world',id:'x'}},entries:{'/x/world.js':load,'/y/world.js':load}}),/Duplicate/);
});

class Color{constructor(value){this.value=value;this.isColor=true;}convertSRGBToLinear(){return this;}copy(other){this.value=other.value;return this;}getHex(){return this.value;}}
class Geometry{dispose(){this.disposed=true;}}
class Material{constructor(options){Object.assign(this,options);}dispose(){this.disposed=true;}}
class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;this.userData={};this.rotation={};this.position={set:(...a)=>{this.pos=a;}};this.scale={setScalar:n=>{this.scalar=n;}};this.visible=true;}
  removeFromParent(){this.parent?.remove(this);}}
class Vector2{constructor(x=0,y=0){this.set(x,y)}set(x,y){this.x=x;this.y=y;return this;}}
const THREE={Vector2,Mesh,ShaderMaterial:Material,PlaneGeometry:Geometry,Color,DoubleSide:2};
function fakeScene(){return {children:[],background:new Color(0x123456),fog:{name:'fog'},
  add(o){if(o.parent)o.removeFromParent();this.children.push(o);o.parent=this;},remove(o){this.children=this.children.filter(x=>x!==o);o.parent=null;}};}

test('Studio owns grid; switching contributes/removes its control and preserves preference',async()=>{
  const scene=fakeScene(),viewport={THREE,scene,camera:{},renderer:{}};
  let attached,cleaned=0,invalidations=0;
  const environment=createViewportEnvironments(viewport,{invalidate:()=>invalidations++,environments:[{id:'room',label:'Комната',module:{mount(ctx){attached={removeFromParent(){scene.remove(this);}};ctx.add(attached);ctx.own(()=>cleaned++);},dispose(){cleaned++;}}}]});
  const display=createViewportDisplay();
  const contribution=contributeStudioGrid({display,environment,get:()=>environment.gridWanted,set:value=>environment.setGrid(value)});
  assert.equal(BASE_MAP_ID,'studio');assert.equal(environment.currentId,'studio');assert.equal(environment.grid.visible,true);
  assert.equal(environment.list()[0].builtIn,true);assert.deepEqual(display.list().map(x=>x.id),['floor-grid']);
  display.list()[0].set(false);assert.equal(environment.grid.visible,false);
  assert.equal(await environment.set('room'),true);assert.equal(environment.grid.visible,false);assert.deepEqual(display.list(),[]);assert(scene.children.includes(attached));
  assert.equal(await environment.set('studio'),true);assert.equal(environment.grid.visible,false);assert.equal(cleaned,2);assert(!scene.children.includes(attached));
  assert.deepEqual(display.list().map(x=>x.id),['floor-grid']);display.list()[0].set(true);assert.equal(environment.grid.visible,true);
  contribution.dispose();display.dispose();environment.dispose();assert.equal(environment.grid.geometry.disposed,true);assert.equal(environment.grid.material.disposed,true);assert.equal(scene.children.length,0);assert(invalidations>0);
});

test('failed and superseded asynchronous mounts fall back safely, cleanup resources, and Studio cannot be disabled',async()=>{
  const scene=fakeScene();let release,disposed=0;const gate=new Promise(resolve=>release=resolve);
  const env=createViewportEnvironments({THREE,scene,camera:{},renderer:{}},{preserveBackground:true,environments:[
    {id:'slow',module:{async mount(ctx){ctx.own(()=>disposed++);await gate;}}},
    {id:'bad',module:{mount(ctx){ctx.own(()=>disposed++);throw Error('broken');}}},
  ]});
  const one=env.set('slow');await new Promise(resolve=>setTimeout(resolve,0));const two=env.set('studio');release();
  assert.equal(await one,false);assert.equal(await two,true);assert.equal(env.currentId,'studio');assert.equal(disposed,1);
  assert.equal(await env.set('bad'),false);assert.match(env.lastError,/broken/);assert.equal(env.currentId,'studio');assert.equal(disposed,2);
  assert.equal(await env.setEnabled('studio',false),false);
  assert.throws(()=>env.register({id:'studio',load}),/reserved/);
  env.dispose();assert.equal(scene.background.value,0x123456);
});

test('reported adapter name is never treated as proof of hardware when debug info is unavailable',()=>{
  const make=name=>({getContext(){return {getExtension:()=>name===null?null:{UNMASKED_RENDERER_WEBGL:1,UNMASKED_VENDOR_WEBGL:2},getParameter:key=>key===1?name:'Google'};}});
  assert.equal(viewportRendererInfo(make('ANGLE (Google, SwiftShader)')).classification,'software');
  assert.equal(viewportRendererInfo(make('NVIDIA RTX')).classification,'reported');
  assert.equal(viewportRendererInfo(make(null)).classification,'unknown');
});

test('a borrowed host grid keeps its appearance and ownership; invalid catalogues roll back',()=>{
  const scene=fakeScene(),grid=new Mesh(new Geometry(),new Material({}));scene.add(grid);grid.visible=false;
  const viewport={THREE,scene,camera:{},renderer:{}};
  const env=createViewportEnvironments(viewport,{studioGrid:grid,gridVisible:true,preserveBackground:true});
  assert.equal(env.grid,grid);assert.equal(grid.visible,true);assert.equal(scene.background.value,0x123456);
  env.dispose();assert.equal(grid.visible,false);assert.equal(grid.geometry.disposed,undefined);assert(scene.children.includes(grid));
  assert.throws(()=>createViewportEnvironments(viewport,{environments:[{id:'studio',module:{mount(){}}}]}),/reserved/);
  assert.equal(scene.children.length,1,'an internally allocated grid is removed on startup failure');
});

test('environment-owned display contributions and asynchronous cancellation clean up on switch/dispose',async()=>{
  const scene=fakeScene(),display=createViewportDisplay();let release,lateError,signal;
  const gate=new Promise(resolve=>release=resolve);
  const env=createViewportEnvironments({THREE,scene,camera:{},renderer:{}},{display,environments:[
    {id:'map',module:{mount(ctx){ctx.contributeDisplay({id:'fog',label:'Fog',get:()=>true,set(){}});}}},
    {id:'slow',module:{async mount(ctx){signal=ctx.signal;await gate;try{ctx.add({});}catch(error){lateError=error;}ctx.own(()=>{lateError.cleaned=true;});}}},
  ]});
  assert.equal(await env.set('map'),true);assert.deepEqual(display.list().map(item=>item.id),['fog']);
  assert.equal(await env.set('studio'),true);assert.deepEqual(display.list(),[]);
  const pending=env.set('slow');await new Promise(resolve=>setTimeout(resolve,0));env.dispose();
  assert(signal.aborted);release();assert.equal(await pending,false);assert.match(lateError.message,/disposed/);assert(lateError.cleaned);
  assert.deepEqual(scene.children,[]);display.dispose();
});

test('disabling a still-loading environment invalidates its pending request',async()=>{
  const scene=fakeScene();let release;
  const gate=new Promise(resolve=>release=resolve);
  const env=createViewportEnvironments({THREE,scene,camera:{},renderer:{}},{environments:[
    {id:'loading',load:async()=>{await gate;return {mount(){throw Error('disabled map must not mount');}};}},
  ]});
  const pending=env.set('loading');await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(await env.setEnabled('loading',false),true);release();
  assert.equal(await pending,false);assert.equal(env.currentId,'studio');assert(!env.list().some(s=>s.id==='loading'));
  env.dispose();
});

test('map schema contributes dynamic controls and removes them on switching',async()=>{
 const scene=fakeScene(),display=createViewportDisplay(),values={props:true,size:16};let mounts=0;
 const mod={settingsSchema:[{key:'props',label:'Пропсы',type:'toggle',default:true},{key:'size',label:'Размер',type:'range',min:1,max:30,step:1,default:16}],getSettings:()=>({...values}),updateSettings(patch){Object.assign(values,patch)},mount(){mounts++}};
 const env=createViewportEnvironments({THREE,scene,camera:{},renderer:{}},{display,environments:[{id:'schema-test',module:mod}]});
 assert.equal(env.grid.uniforms.uCell.value,1,'integer coordinates delimit 1-metre cells');
 assert.equal(await env.set('schema-test'),true);assert.deepEqual(display.list().map(x=>x.id),['map-setting-props','map-setting-size']);
 display.list().find(x=>x.id==='map-setting-size').set(21);assert.equal(values.size,21);
 display.list().find(x=>x.id==='map-setting-props').set(false);assert.equal(values.props,false);
 assert.equal(await env.set('studio'),true);assert.equal(display.list().length,0);
 assert.equal(await env.set('schema-test'),true);assert.equal(display.list()[0].get(),false);assert.equal(mounts,2);
 env.dispose();assert.equal(display.list().length,0);display.dispose();
});

test('host map adapter is scoped to each mount, updated and disposed on switching',async()=>{
 const scene=fakeScene(),events=[];let ctxSeen;
 const env=createViewportEnvironments({THREE,scene,camera:{},renderer:{}},{createContext(ctx){ctx.own(()=>events.push('cleanup'));return {physics:{commit:()=>events.push('physics')}}},afterMount(ctx){ctx.physics.commit()},environments:[{id:'map',module:{mount(ctx){ctxSeen=ctx;events.push('mount')},update(dt,ctx){assert.equal(ctx,ctxSeen);events.push(dt)},dispose(){events.push('dispose')}}}]});
 assert.equal(await env.set('map'),true);env.update(.25);assert.deepEqual(events,['cleanup','mount','physics',.25]);
 await env.set('studio');assert.deepEqual(events,['cleanup','mount','physics',.25,'dispose','cleanup','physics']);env.dispose();assert.equal(events.at(-1),'cleanup');
});

test('Studio pedestal is owned by the map, and can be disabled by the host without affecting the grid',async()=>{
  const T={...THREE,CircleGeometry:Geometry,MeshStandardMaterial:Material};
  for(const enabled of [true,false]){
    const scene=fakeScene();
    const env=createViewportEnvironments({THREE:T,scene,camera:{},renderer:{}},{studioColors:{pedestalVisible:enabled},gridVisible:false});
    const disc=scene.children.find(item=>item.name==='StudioPedestal');
    assert.equal(!!disc,enabled);assert.equal(env.grid.visible,false);
    await env.set('studio',{force:true});
    assert.equal(scene.children.filter(item=>item.name==='StudioPedestal').length,Number(enabled));
    if(disc)assert(disc.geometry.disposed&&disc.material.disposed);
    env.dispose();assert.equal(scene.children.length,0);
  }
});
