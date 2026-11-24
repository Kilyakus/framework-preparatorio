import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installStudioBrowserGestureGuard} from '../src/studio/shell/browser-gestures.js';

test('studio mouse navigation defaults are suppressed without blocking tools or editable context menus',()=>{
  const dom=new JSDOM('<html><body><main><button>tool</button><input></main></body></html>');
  const {document,MouseEvent}=dom.window;
  const old=globalThis.AbortController;globalThis.AbortController=dom.window.AbortController;
  try {
    const root=document.querySelector('main'),button=root.querySelector('button'),input=root.querySelector('input');
    let heard=0;button.addEventListener('mousedown',()=>heard++);
    const dispose=installStudioBrowserGestureGuard({root});
    assert.equal(document.documentElement.style.overscrollBehaviorX,'none');
    const fire=(el,type,button)=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,button});el.dispatchEvent(event);return event;};
    assert(fire(button,'mousedown',2).defaultPrevented);assert.equal(heard,1);
    assert(fire(button,'mousedown',3).defaultPrevented);
    assert(fire(button,'contextmenu',2).defaultPrevented);
    assert(!fire(input,'contextmenu',2).defaultPrevented);
    assert(!fire(button,'mousedown',0).defaultPrevented);
    dispose();assert(!fire(button,'mousedown',3).defaultPrevented);assert.equal(document.documentElement.style.overscrollBehaviorX,'');
  } finally {globalThis.AbortController=old;dom.window.close();}
});
