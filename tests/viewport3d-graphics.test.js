import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewport3D,createViewportGraphics,normalizeViewportGraphics,createAdaptiveResolution,viewportHardwareLimits} from '../src/studio/scopes/viewport3d/index.js';

class Scene{constructor(){this.children=[]}add(...objects){this.children.push(...objects)}traverse(fn){for(const obj of this.children)fn(obj)}}
class Camera{constructor(){this.isPerspectiveCamera=true;this.fov=38}updateProjectionMatrix(){this.updated=(this.updated||0)+1}}
class Renderer{
 constructor(){this.domElement={remove(){}};this.shadowMap={enabled:true,type:1};this.capabilities={maxTextureSize:1024,getMaxAnisotropy:()=>4};this.toneMapping=10;this.toneMappingExposure=1.1;this.outputColorSpace='srgb';this.ratio=1}
 getPixelRatio(){return this.ratio}setPixelRatio(v){this.ratio=v}setSize(w,h){this.size=[w,h]}render(){this.draws=(this.draws||0)+1}dispose(){this.disposals=(this.disposals||0)+1}
 getContext(){return {MAX_RENDERBUFFER_SIZE:1,getParameter:()=>1024,getExtension:()=>null,getContextAttributes:()=>({antialias:true,depth:true})}}
}
const THREE={Scene,PerspectiveCamera:Camera,OrthographicCamera:Camera,WebGLRenderer:Renderer,ACESFilmicToneMapping:10,ReinhardToneMapping:11,NoToneMapping:0,SRGBColorSpace:'srgb',LinearSRGBColorSpace:'linear',PCFShadowMap:1,PCFSoftShadowMap:2};
const host=()=>({clientWidth:300,clientHeight:200,appendChild(el){el.parentNode=this}});
const shadow=()=>({mapSize:{x:256,y:256,set(x,y){this.x=x;this.y=y}},map:{dispose(){this.disposed=true}},bias:-.001,normalBias:.01,radius:2});

test('graphics settings clamp malformed and legacy inputs without eating host state',()=>{
 const value=normalizeViewportGraphics({exposure:100,renderScale:.01,shadow:'8192',anisotropy:'999',cameraFov:500});
 assert.equal(value.exposure,3);assert.equal(value.renderScale,.5);assert.equal(value.shadow,'8192');assert.equal(value.anisotropy,'source');assert.equal(value.cameraFov,100);
 assert.doesNotThrow(()=>normalizeViewportGraphics(null));
 const gl=normalizeViewportGraphics({globalLighting:'yes',globalLightingIntensity:99});
 assert.equal(gl.globalLighting,true);assert.equal(gl.globalLightingIntensity,3);
 assert.equal(normalizeViewportGraphics({globalLighting:false}).globalLighting,false);
 assert.equal(normalizeViewportGraphics({}).globalLighting,true);
 assert.equal(normalizeViewportGraphics({}).globalLightingIntensity,1);
});
test('renderer settings, GPU caps, shadows and textures are applied and restored without owning scene assets',()=>{
 const vp=createViewport3D({THREE,container:host()}),s=shadow(),texture={isTexture:true,anisotropy:2},mat={map:texture,needsUpdate:false};
 vp.scene.add({isLight:true,castShadow:true,shadow:s},{material:mat});const changes=[];
 const graphics=createViewportGraphics(vp,{settings:{shadow:'8192'},onChange:v=>changes.push(v)});
 assert.equal(viewportHardwareLimits(vp.renderer).shadowCeiling,1024);assert.equal(s.mapSize.x,1024);
 assert.equal(graphics.snapshot().limits.shadowCeiling,1024);
 assert.equal(vp.renderer.ratio,1);graphics.set({renderScale:.65});assert.equal(vp.renderer.ratio,.65);
 graphics.set({shadow:'off',toneMapping:'reinhard',colorSpace:'linear',exposure:1.5,anisotropy:'16',cameraFov:60});
 assert.equal(vp.renderer.shadowMap.enabled,false);assert.equal(vp.renderer.toneMapping,11);assert.equal(vp.renderer.outputColorSpace,'linear');assert.equal(vp.renderer.toneMappingExposure,1.5);
 assert.equal(texture.anisotropy,4);assert.equal(vp.camera.fov,60);assert(mat.needsUpdate);assert(changes.length);
 graphics.set({shadow:'512',shadowType:'soft',shadowAdjust:true,shadowBias:-.002,shadowNormalBias:.025,shadowRadius:5});
 assert.equal(vp.renderer.shadowMap.enabled,true);assert.equal(s.mapSize.x,512);assert.equal(s.bias,-.002);assert.equal(s.normalBias,.025);assert.equal(vp.renderer.shadowMap.type,2);
 graphics.set({shadowAdjust:false,anisotropy:'source'});assert.equal(s.bias,-.001);assert.equal(texture.anisotropy,2);
 graphics.set({anisotropy:'4'});graphics.dispose();assert.equal(texture.anisotropy,2);vp.render();vp.dispose();vp.dispose();assert.equal(vp.renderer.disposals,1);
});
test('unsupported renderer options do not masquerade as working settings',()=>{
 const newer={...THREE,REVISION:'186',BasicShadowMap:0};
 const vp=createViewport3D({THREE:newer,container:host()});vp.renderer.shadowMap.type=newer.PCFSoftShadowMap;
 const graphics=createViewportGraphics(vp,{settings:{shadowType:'soft',toneMapping:'agx'}});
 assert.equal(graphics.value.shadowType,'pcf');assert.equal(vp.renderer.shadowMap.type,newer.PCFShadowMap);
 assert(!graphics.snapshot().supportedShadowTypes.includes('soft'));
 assert.equal(graphics.value.toneMapping,'aces');assert(!graphics.snapshot().supportedToneMappings.includes('agx'));
 graphics.set({shadowType:'basic'});graphics.set({shadowType:'soft',exposure:1.7});
 assert.equal(graphics.value.shadowType,'basic');assert.equal(vp.renderer.shadowMap.type,newer.BasicShadowMap);
 assert.equal(vp.renderer.toneMappingExposure,1.7);graphics.dispose();vp.dispose();
 const older={...THREE,REVISION:'185'},old=createViewport3D({THREE:older,container:host()});
 const previous=createViewportGraphics(old,{settings:{shadowType:'soft'}});
 assert(previous.snapshot().supportedShadowTypes.includes('soft'));assert.equal(old.renderer.shadowMap.type,older.PCFSoftShadowMap);
 previous.dispose();old.dispose();
});
test('adapter owns dynamic quality and manual correction can be reset',()=>{
 const vp=createViewport3D({THREE,container:host()}),s=shadow();vp.scene.add({isLight:true,castShadow:true,shadow:s});
 const calls=[];const adapter={setQuality:q=>calls.push(q),snapshot:()=>({ceiling:512,size:512}),resetAdjust:()=>{s.bias=-.004;calls.push('reset')}};
 const graphics=createViewportGraphics(vp,{shadowAdapter:adapter,settings:{shadow:'2048'}});
 assert.deepEqual(calls,[512]);graphics.set({shadowAdjust:true,shadowBias:-.01});assert.equal(s.bias,-.01);
 graphics.set({shadowAdjust:false});assert.equal(s.bias,-.004);assert.deepEqual(calls,[512,'reset']);
 graphics.set({shadow:'auto'});assert.equal(calls.at(-1),null);graphics.dispose();vp.dispose();
});
test('adaptive scale uses hysteresis and ignores idle/pause frames',()=>{
 const a=createAdaptiveResolution();for(let i=0;i<32;i++)a.sample(1/30,60);assert(a.scale<1);const after=a.scale;
 a.sample(4,60);assert.equal(a.scale,after);
 for(let i=0;i<200;i++)a.sample(1/60,60);assert(a.scale>after);a.reset();assert.equal(a.scale,1);
});

test('far clipping is opt-in, finite and restored when reset or disposed',()=>{
 const vp=createViewport3D({THREE,container:host()});vp.camera.near=.1;vp.camera.far=100;
 const g=createViewportGraphics(vp);assert.equal(vp.camera.far,100);
 g.set({cameraFar:1000});assert.equal(vp.camera.far,1000);
 g.set({cameraFar:0});assert.equal(vp.camera.far,100);
 g.set({cameraFar:999999999});assert.equal(vp.camera.far,1000000);
 vp.camera.far=500;vp.render();assert.equal(vp.camera.far,1000000);
 g.dispose();assert.equal(vp.camera.far,500);vp.dispose();
});

test('global lighting toggles scene.environment and restores it on dispose',()=>{
 const vp=createViewport3D({THREE,container:host()});
 const env={isTexture:true};vp.scene.environment=env;vp.scene.environmentIntensity=1;
 const g=createViewportGraphics(vp);
 assert.equal(vp.scene.environment,env);assert.equal(g.snapshot().globalLighting.hasEnvironment,true);
 g.set({globalLighting:false});assert.equal(vp.scene.environment,null);assert.equal(vp.scene.environmentIntensity,0);
 assert.equal(g.snapshot().globalLighting.enabled,false);
 g.set({globalLighting:true,globalLightingIntensity:2.5});assert.equal(vp.scene.environment,env);assert.equal(vp.scene.environmentIntensity,2.5);
 // Host replaces the environment (world switch): refresh must keep the new one.
 const env2={isTexture:true};vp.scene.environment=env2;g.refresh();assert.equal(vp.scene.environment,env2);
 g.set({globalLighting:false});assert.equal(vp.scene.environment,null);
 g.dispose();assert.equal(vp.scene.environment,env2);assert.equal(vp.scene.environmentIntensity,1);vp.dispose();
});
test('global lighting adapter owns hemi/ambient and scene.environment is untouched',()=>{
 const vp=createViewport3D({THREE,container:host()});
 const env={isTexture:true};vp.scene.environment=env;
 const calls=[];const adapter={setEnabled:v=>calls.push(['enabled',v]),setIntensity:v=>calls.push(['intensity',v]),snapshot:()=>({enabled:true})};
 const g=createViewportGraphics(vp,{globalLightingAdapter:adapter,settings:{globalLighting:false,globalLightingIntensity:.5}});
 assert.equal(vp.scene.environment,env);assert.deepEqual(calls,[['enabled',false],['intensity',.5]]);
 assert.equal(g.snapshot().globalLighting.viaAdapter,true);
 g.set({globalLighting:true,globalLightingIntensity:2});assert.deepEqual(calls.at(-2),['enabled',true]);assert.deepEqual(calls.at(-1),['intensity',2]);
 g.dispose();assert.deepEqual(calls.at(-2),['enabled',true]);assert.deepEqual(calls.at(-1),['intensity',1]);vp.dispose();
});
test('shared auto shadow quality reacts to sustained load and preserves manual selection',()=>{
 const vp=createViewport3D({THREE,container:host()}),s=shadow();s.camera={top:2,bottom:-2};vp.scene.add({isLight:true,castShadow:true,shadow:s});
 const perf=globalThis.performance;let now=1;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});
 try{
  vp.renderer.capabilities.maxTextureSize=8192;vp.renderer.getContext=()=>({MAX_RENDERBUFFER_SIZE:1,getParameter:()=>8192,getExtension:()=>null});
  const g=createViewportGraphics(vp,{settings:{shadow:'auto'}});const initial=g.snapshot().shadowInfo.size;
  for(let i=0;i<100;i++){now+=33.4;vp.render()}
  assert(g.snapshot().shadowInfo.size<initial);g.set({shadow:'2048'});assert.equal(s.mapSize.x,2048);
  for(let i=0;i<100;i++){now+=33.4;vp.render()}assert.equal(s.mapSize.x,2048);
  g.set({shadow:'auto'});assert.equal(g.snapshot().shadowInfo.mode,'auto');g.dispose();
 } finally {Object.defineProperty(globalThis,'performance',{configurable:true,value:perf});vp.dispose();}
});
