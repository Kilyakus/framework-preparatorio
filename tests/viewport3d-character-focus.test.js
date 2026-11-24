import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createViewportCharacterFocus} from '../src/studio/scopes/viewport3d/camera/character-focus.js';

test('selection, preview return and control-mode follow preserve camera offset without moving actors',()=>{
  const camera={position:new Vector3(0,2,5)},controls={target:new Vector3(0,1,0),enablePan:true,enableDamping:true,update(){}};
  let actor=new Vector3(4,1,3),preview=false,control=false;
  const focus=createViewportCharacterFocus({camera,controls,getAnchor:()=>actor,isPreview:()=>preview,isControlMode:()=>control});
  const offset=camera.position.clone().sub(controls.target);
  focus.selectionChanged();assert.deepEqual(controls.target.toArray(),[4,1,3]);assert(camera.position.clone().sub(controls.target).equals(offset));assert.deepEqual(actor.toArray(),[4,1,3]);
  preview=true;focus.previewChanged();actor=new Vector3(-5,1,7);focus.selectionChanged();assert.equal(controls.target.x,4);
  preview=false;focus.previewChanged();assert(controls.target.equals(actor));
  control=true;focus.modeChanged();assert.equal(controls.enablePan,false);
  actor.x+=2;focus.update();assert(controls.target.equals(actor));assert(camera.position.clone().sub(controls.target).equals(offset));
  control=false;focus.modeChanged();assert.equal(controls.enablePan,true);actor.x++;focus.update();assert.notEqual(controls.target.x,actor.x);
  control=true;focus.modeChanged();focus.dispose();assert.equal(controls.enablePan,true);
});

test('right drag in control mode changes only world height and follows actor; dispose removes input',()=>{
  const element=new EventTarget();element.clientHeight=200;element.setPointerCapture=()=>{};
  const camera={position:new Vector3(0,2,5),fov:45},controls={target:new Vector3(0,1,0),enablePan:true,enableDamping:false,update(){}};
  let actor=new Vector3(0,1,0),control=true;
  const focus=createViewportCharacterFocus({camera,controls,element,getAnchor:()=>actor,isControlMode:()=>control});focus.modeChanged();
  const send=(type,props)=>{const event=new Event(type,{cancelable:true});Object.assign(event,props);element.dispatchEvent(event);};
  send('pointerdown',{button:2,pointerId:1,pointerType:'mouse',clientY:20});send('pointermove',{pointerId:1,clientY:60});send('pointerup',{pointerId:1});
  const y=controls.target.y;assert(y>1);assert.equal(controls.target.x,0);assert.equal(controls.target.z,0);assert.equal(camera.position.x,0);assert.equal(camera.position.z,5);
  actor.x=3;focus.update();assert.equal(controls.target.x,3);assert.equal(controls.target.y,y);
  control=false;focus.modeChanged();assert.equal(controls.enablePan,true);focus.dispose();
  send('pointerdown',{button:2,pointerId:1,pointerType:'mouse',clientY:0});send('pointermove',{pointerId:1,clientY:100});assert.equal(controls.target.y,y);
});
