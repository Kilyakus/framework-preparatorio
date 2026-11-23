import {createViewportSkeleton} from '../skeleton/visual.js';
/** Generic selected-object display. Host supplies the live active root and may
 * retain a richer implementation (e.g. Morphia's interactive skeleton). */
export const VIEWPORT3D_SHADING_TEMPLATE=`<div class="viewport-shading-tools" data-v3d-shading role="group" aria-label="Режим отображения" hidden><button type="button" class="b-header-btn viewport-shading-tool" data-shading="solid" aria-label="Поверхность" title="Поверхность" aria-pressed="true"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/><path d="M3.4 10.8a5.5 5.5 0 0 0 9.2 0" fill="currentColor" stroke="none"/></svg></button><button type="button" class="b-header-btn viewport-shading-tool" data-shading="wire" aria-label="Каркас" title="Каркас" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.7 5.4 3.1v6.4L8 14.3l-5.4-3.1V4.8L8 1.7ZM2.6 4.8 8 8l5.4-3.2M8 8v6.3"/></svg></button><button type="button" class="b-header-btn viewport-shading-tool" data-shading="rig" aria-label="Скелет" title="Скелет" aria-pressed="false"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="2.5" r="1.3"/><circle cx="8" cy="7.7" r="1.1"/><circle cx="4.5" cy="5.2" r=".9"/><circle cx="11.5" cy="5.2" r=".9"/><circle cx="5.1" cy="13" r="1"/><circle cx="10.9" cy="13" r="1"/><path d="M8 3.8v2.8M7.2 7 5.1 6M8.8 7l2.1-1M7.5 8.6 5.6 12M8.5 8.6l1.9 3.4"/></svg></button></div>`;

export function mountViewportShading({root,viewport,getObject,invalidate=()=>{},onChange=()=>{}}={}){
 if(!root?.querySelector||!viewport?.THREE||typeof getObject!=='function')throw new TypeError('Viewport shading requires a host, viewport and active object getter');
 const host=root.querySelector('[data-v3d-shading]');if(!host)throw new Error('Viewport shading slot missing');
 const buttons=[...host.querySelectorAll('[data-shading]')],THREE=viewport.THREE,records=[],clones=new Set();
 const abort=new (root.ownerDocument.defaultView?.AbortController??AbortController)();let selected=null,helper=null,mode='solid',disposed=false;
 function restore(){
  for(const {mesh,material,mask} of records.splice(0)){mesh.material=material;mesh.layers.mask=mask;}
  for(const material of clones)material.dispose?.();clones.clear();
  if(helper){helper.dispose();helper=null;}
 }
 function hasBones(object){let found=false;object?.traverse?.(o=>{if(o.isBone||(o.isSkinnedMesh&&o.skeleton?.bones?.length))found=true});return found;}
 function syncButtons(){const available=!!selected,bones=available&&hasBones(selected);for(const button of buttons){button.disabled=!available||(button.dataset.shading==='rig'&&!bones);button.setAttribute('aria-pressed',String(button.dataset.shading===mode));}}
 function apply(){
  restore();if(!selected){syncButtons();return;}
  if(mode==='rig'&&!hasBones(selected))mode='solid';
  if(mode==='rig'){
   helper=createViewportSkeleton({THREE,scene:viewport.scene,root:selected});helper.update({visible:selected.visible!==false});
  }
  const cache=new Map();
  selected.traverse(mesh=>{
   if(!mesh.isMesh)return;
   records.push({mesh,material:mesh.material,mask:mesh.layers.mask});
   if(mode==='rig')mesh.layers.disable(0);
   if(mode==='wire'){
    const clone=material=>{if(!material)return material;if(!cache.has(material)){const copy=material.clone();if('wireframe'in copy){copy.wireframe=true;copy.needsUpdate=true;}cache.set(material,copy);clones.add(copy);}return cache.get(material);};
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);
   }
  });syncButtons();
 }
 function refresh(force=false){if(disposed)return;const object=getObject()??null;if(force||object!==selected){restore();selected=object;apply();}if(helper)helper.update({visible:selected?.visible!==false});}
 function set(modeNext){if(disposed||!['solid','wire','rig'].includes(modeNext))return false;refresh();if(!selected||(modeNext==='rig'&&!hasBones(selected)))return false;mode=modeNext;apply();onChange(mode);invalidate();return true;}
 for(const button of buttons)button.addEventListener('click',()=>set(button.dataset.shading),{signal:abort.signal});
 host.hidden=false;refresh(true);const off=viewport.onRender?.(()=>refresh(),{phase:'before'})??(()=>{});
 const offSelection=viewport.onActiveObjectChange?.(()=>{refresh();invalidate();})??(()=>{});
 return {set,refresh:()=>{refresh(true);invalidate();},get mode(){return mode;},dispose(){if(disposed)return;disposed=true;off();offSelection();abort.abort();restore();host.hidden=true;}};
}
