import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {mountViewportClasses} from '../src/studio/scopes/viewport3d/index.js';

test('host theme classes apply to root, portaled popup and late controls and are cleaned up', async()=>{
  const dom=new JSDOM('<body><div id="root"><header class="v3d-header b-header"></header><div data-v3d-tool-host></div></div><div data-v3d-graphics-panel></div></body>');
  const doc=dom.window.document,root=doc.querySelector('#root'),panel=doc.querySelector('[data-v3d-graphics-panel]');
  const css=mountViewportClasses({root,panel,classes:{header:'b-header b-header-lumino',settingsPanel:['b-menu-pop','app-panel'],tool:'app-tool',section:'app-section'}});
  assert(root.querySelector('header').classList.contains('b-header-lumino'));assert(panel.classList.contains('b-menu-pop'));
  const tool=doc.createElement('button');tool.dataset.viewportTool='orbit';root.querySelector('[data-v3d-tool-host]').append(tool);
  const section=doc.createElement('section');section.className='v3d-section';panel.append(section);
  await new Promise(resolve=>dom.window.setTimeout(resolve,0));
  assert(tool.classList.contains('app-tool'));assert(section.classList.contains('app-section'));
  css.dispose();css.dispose();assert(root.querySelector('header').classList.contains('b-header'));assert(!root.querySelector('header').classList.contains('b-header-lumino'));assert(!panel.classList.contains('app-panel'));
  assert(!tool.classList.contains('app-tool'));assert(!section.classList.contains('app-section'));dom.window.close();
});

test('the shared header and popup CSS contain no host theme rules',async()=>{
  const css=await readFile(new URL('../src/web/assets/css/viewport3d.css',import.meta.url),'utf8');
  for(const selector of ['.v3d-header','.v3d-graphics-pop']){
    const rule=css.match(new RegExp(selector.replace('.','\\.')+'\\{([^}]+)\\}'))?.[1]??'';
    assert(rule);assert(!/(?:background|border|padding|font|color|box-shadow|backdrop-filter)\s*:/.test(rule),rule);
  }
});
