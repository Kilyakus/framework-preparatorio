import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewportModes,VIEWPORT3D_VIEW_MODE,VIEWPORT3D_ORBIT_TOOL} from '../src/studio/scopes/viewport3d/index.js';

test('only view and orbit are built in; applications can add independent modes',()=>{
 const calls=[],mode=createViewportModes({onModeChange:id=>{calls.push(`m:${id}`)},onToolChange:id=>{calls.push(`t:${id}`)}});
 assert.deepEqual(mode.value.modes.map(x=>x.id),['view']);assert.deepEqual(mode.value.tools.map(x=>x.id),['orbit']);
 assert.equal(mode.setTool('select'),false);assert.equal(mode.setMode('character'),false);
 mode.registerTool({id:'select',label:'Выбрать'});mode.registerTool({id:'pull',label:'Тянуть'});
 mode.registerMode({id:'character',label:'Управление',tools:['orbit','select']});mode.registerMode({id:'spring-ik',label:'Spring-IK',tools:['orbit','pull'],defaultTool:'pull'});
 mode.setMode('character');mode.setTool('select');mode.setMode('spring-ik');assert.equal(mode.value.tool,'pull');
 mode.setMode('view');assert.deepEqual(mode.value.tools.map(x=>x.id),['orbit']);assert.equal(mode.value.tool,'orbit');
 mode.setMode('character');assert.equal(mode.value.tool,'select');assert(calls.includes('t:pull'));
 mode.setAvailable('character',false);assert.equal(mode.value.mode,'view');assert.equal(mode.setMode('character'),false);
 mode.setAvailable('character',true);mode.setMode('character');assert.equal(mode.value.tool,'select');
 assert.throws(()=>mode.registerMode({id:'view',label:'duplicate',tools:['orbit']}),/duplicate/);mode.dispose();mode.dispose();
});
test('host can reject a mode/tool and state remains unchanged',()=>{
 const modes=createViewportModes({tools:[{id:'select',label:'Select'}],modes:[{id:'other',label:'Other',tools:['orbit','select']}],onModeChange:id=>id!=='other'});
 assert.equal(modes.setMode('other'),false);assert.equal(modes.value.mode,'view');modes.dispose();
});
