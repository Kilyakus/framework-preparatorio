import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewport3D,createViewportGraphics} from '../src/studio/scopes/viewport3d/index.js';
class Scene {traverse() {}}
class Camera {}
class Renderer {constructor(){this.domElement={remove(){}};this.shadowMap={enabled:false};this.capabilities={maxTextureSize:1024};this.pixelRatio=1}setPixelRatio(value){this.pixelRatio=value}getPixelRatio(){return this.pixelRatio}setSize(){}render(){}dispose(){}getContext(){return {MAX_RENDERBUFFER_SIZE:1,getParameter:()=>1024}}}
const THREE={Scene,PerspectiveCamera:Camera,WebGLRenderer:Renderer};
test('render scale is bounded by device pixel ratio, supersampling cap and renderbuffer dimensions',()=>{
 const previous=globalThis.devicePixelRatio;globalThis.devicePixelRatio=2;
 try{
  const host={clientWidth:2048,clientHeight:1024,appendChild(el){el.parentNode=this}};
  const vp=createViewport3D({THREE,container:host}),graphics=createViewportGraphics(vp,{settings:{renderScale:2,maxPixelRatio:3}});
  assert.equal(vp.renderer.getPixelRatio(),.5);
  host.clientWidth=100;host.clientHeight=100;vp.resize();assert.equal(vp.renderer.getPixelRatio(),3);
  graphics.set({renderScale:.5});assert.equal(vp.renderer.getPixelRatio(),1);
  graphics.dispose();vp.dispose();
 }finally{if(previous===undefined)delete globalThis.devicePixelRatio;else globalThis.devicePixelRatio=previous;}
});
