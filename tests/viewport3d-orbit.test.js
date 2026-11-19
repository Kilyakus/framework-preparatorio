import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewportOrbit} from '../src/studio/scopes/viewport3d/orbit.js';

// Minimal injected Three-like vectors keep the framework free of a Three.js
// runtime dependency; the real renderer and pointer input are also exercised
// by the Prismia framework-viewport browser test.
class Vector3 {
  constructor(x=0,y=0,z=0){this.set(x,y,z);}
  set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  clone(){return new Vector3(this.x,this.y,this.z);}
  copy(v){return this.set(v.x,v.y,v.z);}
  add(v){return this.set(this.x+v.x,this.y+v.y,this.z+v.z);}
  sub(v){return this.set(this.x-v.x,this.y-v.y,this.z-v.z);}
  multiplyScalar(n){return this.set(this.x*n,this.y*n,this.z*n);}
  lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z;}
  length(){return Math.sqrt(this.lengthSq());}
  distanceTo(v){return this.clone().sub(v).length();}
  setLength(n){return this.multiplyScalar(n/(this.length()||1));}
  applyQuaternion(){return this;}
  array(){return [this.x,this.y,this.z];}
}
class Canvas extends EventTarget {
  clientWidth=400;clientHeight=300;attributes=new Map();
  hasAttribute(name){return this.attributes.has(name);}
  setAttribute(name,value){this.attributes.set(name,value);}
  setPointerCapture(){}
}
function fire(target,type,properties={}){
  const event=new Event(type,{cancelable:true});Object.assign(event,properties);target.dispatchEvent(event);return event;
}

test('orbit gates only input, cancels a disabled drag and cleans up listeners',()=>{
  const canvas=new Canvas(),camera={position:new Vector3(0,0,4),zoom:1,fov:45,quaternion:{},
    lookAt(){},updateProjectionMatrix(){}};
  let enabled=false,changes=0;
  const orbit=createViewportOrbit({THREE:{Vector3},camera,canvas},{isEnabled:()=>enabled,onChange:()=>changes++});
  const initial=camera.position.array();
  assert.equal(fire(canvas,'wheel',{deltaY:100}).defaultPrevented,false);
  fire(canvas,'pointerdown',{pointerType:'mouse',button:0,pointerId:1,clientX:10,clientY:10});
  fire(canvas,'pointermove',{pointerId:1,clientX:80,clientY:10});
  assert.deepEqual(camera.position.array(),initial);assert.equal(changes,0);
  enabled=true;
  assert.equal(fire(canvas,'wheel',{deltaY:100}).defaultPrevented,true);
  assert(camera.position.distanceTo(new Vector3(...initial))>.1);
  fire(canvas,'pointerdown',{pointerType:'mouse',button:0,pointerId:2,clientX:10,clientY:10});
  fire(canvas,'pointermove',{pointerId:2,clientX:50,clientY:10});
  const moved=camera.position.array(),previous=changes;
  enabled=false;fire(canvas,'pointermove',{pointerId:2,clientX:80,clientY:10});
  enabled=true;fire(canvas,'pointermove',{pointerId:2,clientX:90,clientY:10});
  assert.deepEqual(camera.position.array(),moved);assert.equal(changes,previous);
  enabled=false;orbit.reset();assert.deepEqual(camera.position.array(),initial);
  orbit.dispose();orbit.dispose();enabled=true;
  fire(canvas,'wheel',{deltaY:100});assert.deepEqual(camera.position.array(),initial);
});
