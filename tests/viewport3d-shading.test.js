import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import * as THREE from 'three';
import {VIEWPORT3D_SHADING_TEMPLATE,mountViewportShading} from '../src/studio/scopes/viewport3d/index.js';
test('shared shading restores shared materials and layers and follows active object',()=>{
 const dom=new JSDOM(`<main>${VIEWPORT3D_SHADING_TEMPLATE}</main>`),root=dom.window.document.querySelector('main'),scene=new THREE.Scene();
 const group=new THREE.Group(),bone=new THREE.Bone(),child=new THREE.Bone();child.position.y=1;bone.add(child);group.add(bone);const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);group.add(mesh);scene.add(group);
 const other=new THREE.Mesh(new THREE.BoxGeometry(),material);scene.add(other);let active=group,frame;const viewport={THREE,scene,onRender(fn){frame=fn;return ()=>frame=null}};
 const ui=mountViewportShading({root,viewport,getObject:()=>active});assert.equal(root.querySelector('[data-v3d-shading]').hidden,false);
 ui.set('wire');assert.notEqual(mesh.material,material);assert(mesh.material.wireframe);assert.equal(other.material.wireframe,false);
 ui.set('rig');assert.equal(mesh.material,material);assert.equal(mesh.layers.mask&1,0);assert.equal(scene.getObjectByName('viewport3d-skeleton-points').children.filter(p=>p.visible).length,2);assert(scene.getObjectByName('viewport3d-skeleton-lines').visible);
 active=other;frame();assert.equal(mesh.layers.mask&1,1);assert.equal(ui.mode,'solid');assert.equal(root.querySelector('[data-shading=rig]').disabled,true);assert(!scene.getObjectByName('viewport3d-skeleton-points'));
 ui.set('wire');ui.dispose();assert.equal(other.material,material);assert.equal(frame,null);assert.equal(root.querySelector('[data-v3d-shading]').hidden,true);dom.window.close();
});

test('object selector host is immediately before viewport mode selector',async()=>{
 const {VIEWPORT3D_HEADER_TEMPLATE}=await import('../src/studio/scopes/viewport3d/index.js');
 const dom=new JSDOM(VIEWPORT3D_HEADER_TEMPLATE),slot=dom.window.document.querySelector('[data-v3d-object-host]');
 assert(slot);assert(slot.nextElementSibling.matches('[data-v3d-mode-host]'));assert.equal(slot.childElementCount,0);dom.window.close();
});
