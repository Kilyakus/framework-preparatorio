import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createViewportDisplay,createViewportEnvironments} from '../src/studio/scopes/viewport3d/index.js';
test('Studio takes host colours privately, follows world-space subject and cleans resources',async()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),renderer={},display=createViewportDisplay();
 const object=new THREE.Object3D();object.position.set(12,0,-7);object.updateMatrixWorld(true);
 const world=createViewportEnvironments({THREE,scene,camera,renderer},{display,studioColors:{background:0x234567,pedestal:0x334455,grid:{major:0xaabbcc,minor:0x778899}},getGridFocus:()=>object});
 const grid=world.grid,pedestal=scene.getObjectByName('StudioPedestal');assert(pedestal);assert.equal(scene.background.getHex(),0x234567);assert.equal(pedestal.material.color.getHex(),0x334455);assert.equal(grid.uniforms.uCell.value,1);assert.equal(grid.uniforms.uGridHalfExtent.value,3.25);assert.equal(grid.uniforms.uMajor.value.getHex(),new THREE.Color(0xaabbcc).convertSRGBToLinear().getHex());grid.onBeforeRender();assert.deepEqual(grid.uniforms.uFocus.value.toArray(),[12,-7]);assert.equal(display.list().length,0,'colours never appear as display settings');
 world.dispose();display.dispose();assert.equal(scene.children.length,0);
});
