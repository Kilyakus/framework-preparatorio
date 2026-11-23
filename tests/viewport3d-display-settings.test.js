import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createViewportDisplay,mountViewportDisplay} from '../src/studio/scopes/viewport3d/index.js';

test('map toggle, number and select settings render, update and disappear',()=>{
 const dom=new JSDOM('<div id="host"></div>'),doc=dom.window.document,host=doc.querySelector('#host'),display=createViewportDisplay(),values={props:true,size:2,palette:'a'};
 const remove=[display.register({id:'props',label:'Предметы',get:()=>values.props,set:v=>values.props=v}),display.register({id:'size',label:'Размер',type:'range',min:1,max:10,step:1,get:()=>values.size,set:v=>values.size=v}),display.register({id:'palette',label:'Палитра',type:'select',options:[{value:'a',label:'A'},{value:'b',label:'B'}],get:()=>values.palette,set:v=>values.palette=v})];
 const view=mountViewportDisplay({host,display});const change=(id,value)=>{const input=host.querySelector(`[data-v3d-display-control=${id}]`);if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 change('props',false);change('size','7');change('palette','b');assert.deepEqual(values,{props:false,size:7,palette:'b'});assert.equal(host.querySelector('output').textContent,'7');
 for(const off of remove)off();assert.equal(host.querySelectorAll('[data-v3d-display-item]').length,0);view.dispose();display.dispose();dom.window.close();
});
