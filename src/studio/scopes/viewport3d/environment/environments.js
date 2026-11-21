import {BASE_MAP_ID,BUILTIN_VIEWPORT_ENVIRONMENTS,createBaseMapGrid,isBaseMap,studioMap} from '../../../../plugins/worlds/studio.js';
import {mountViewportSection} from '../ui/sections.js';

const ID=/^[a-z0-9][a-z0-9._-]*$/i;
/** Normalize a plugin descriptor once for all hosts. The Studio id is reserved. */
export function normalizeViewportEnvironment(spec,{builtIn=false}={}) {
  const id=String(spec?.id??'').trim();
  if(!ID.test(id)||(id.toLowerCase()===BASE_MAP_ID&&(!builtIn||id!==BASE_MAP_ID)))throw new TypeError('viewport environment: invalid or reserved id');
  const load=typeof spec.load==='function'?spec.load:spec.module?async()=>spec.module:
    spec.entryUrl?async()=>import(/* @vite-ignore */ spec.entryUrl):null;
  if(!load)throw new TypeError('viewport environment: module or load is required');
  return {id,label:String(spec.label||id),description:String(spec.description||''),
    order:Number.isFinite(spec.order)?spec.order:999,load,builtIn:!!builtIn,enabled:spec.enabled!==false};
}

/**
 * Vite requires glob literals to live in the application being built. A host
 * passes its two import.meta.glob results here; parsing, validation, ordering and
 * discovery rules stay shared. Missing folders simply produce empty objects.
 */
export function discoverViewportEnvironments({manifests={},entries={}}={}) {
  const result=[],ids=new Set();
  for(const [path,value] of Object.entries(manifests)){
    const manifest=value?.default??value;
    if(manifest?.kind!=='world'&&manifest?.kind!=='environment')continue;
    const folder=path.slice(0,path.lastIndexOf('/')),entry=String(manifest.entry||'world.js');
    if(!folder||entry.includes('/')||entry.includes('\\')||entry.includes('..'))continue;
    const load=entries[`${folder}/${entry}`];
    if(typeof load!=='function')continue;
    try{
      const normalized=normalizeViewportEnvironment({...manifest,load});
      if(ids.has(normalized.id))throw new Error(`Duplicate viewport environment: ${normalized.id}`);
      ids.add(normalized.id);result.push({...manifest,load});
    }catch(error){if(String(error?.message).startsWith('Duplicate'))throw error;}
  }
  return result.sort((a,b)=>(Number.isFinite(a.order)?a.order:999)-(Number.isFinite(b.order)?b.order:999));
}

/**
 * Generic scene adapter. Morphia may instead supply its WorldManager, which
 * owns its own physics, spawn points, lights, world shaders and plugin context.
 * Generic plugins get {THREE,scene,camera,renderer,signal,add,own,look,
 * contributeDisplay}; they must explicitly dispose their own resources.
 * Mounts are serialized and stale
 * requests are discarded; a failed environment falls back to Studio.
 */
export function createViewportEnvironments(viewport,{environments=[],gridVisible=true,studioGrid=null,display=null,preserveBackground=false,invalidate=()=>{},onError=()=>{}}={}) {
  const {THREE,scene,camera,renderer}=viewport??{};
  if(!THREE||!scene)throw new TypeError('viewport environments require host THREE and scene');
  const specs=new Map(),listeners=new Set(),originalBackground=scene.background,originalFog=scene.fog;
  // A host can supply a borrowed, already-mounted grid to preserve its own
  // established appearance. Otherwise Studio owns the common shader grid.
  const ownsGrid=!studioGrid,grid=studioGrid??createBaseMapGrid(THREE,scene),originalGridVisible=grid.visible;
  grid.setGround?.(0);
  let wanted=gridVisible!==false,currentId=BASE_MAP_ID,current=studioMap,objects=[],cleanups=[],disposed=false,token=0,queue=Promise.resolve(),lastError=null,controller=null,requested=BASE_MAP_ID;
  const emit=()=>{for(const fn of [...listeners])try{fn(currentId);}catch(error){console.warn('viewport environment listener',error);}invalidate();};
  const restore=()=>{scene.background=originalBackground;scene.fog=originalFog;};
  const applyGrid=()=>{grid.visible=isBaseMap(currentId)&&wanted;invalidate();};
  const context=()=>{
    controller=new AbortController();const signal=controller.signal;
    return {THREE,scene,camera,renderer,signal,
      add(object){if(signal.aborted)throw new Error('viewport environment was disposed');if(object){scene.add(object);objects.push(object);}return object;},
      own(fn){if(typeof fn==='function'){if(signal.aborted)fn();else cleanups.push(fn);}return fn;},
      contributeDisplay(item){
        if(signal.aborted)throw new Error('viewport environment was disposed');
        if(!display?.register)throw new Error('viewport display is unavailable');
        const remove=display.register(item);cleanups.push(remove);return remove;
      },
      look(options={}){
        if(signal.aborted)return;
        if(!preserveBackground&&options.clearColor!=null)scene.background=new THREE.Color(options.clearColor);
        if(options.fog===null)scene.fog=null;
        if(options.grid?.palette)grid.setPalette?.(options.grid.palette);
        applyGrid();
      },
    };
  };
  let ctx=null;
  const clear=()=>{
    controller?.abort();controller=null;
    try{current?.dispose?.(ctx);}catch(error){console.warn('viewport environment cleanup',error);}
    for(const fn of cleanups.splice(0).reverse())try{fn();}catch(error){console.warn('viewport environment cleanup',error);}
    for(const object of objects.splice(0))object.removeFromParent?.();
    current=null;ctx=null;restore();
  };
  const installStudio=()=>{currentId=BASE_MAP_ID;current=studioMap;ctx=context();studioMap.mount(ctx);applyGrid();};
  const register=(spec,{builtIn=false}={})=>{
    if(disposed)throw new Error('viewport environments disposed');
    const normalized=normalizeViewportEnvironment(spec,{builtIn});
    if(specs.has(normalized.id))throw new Error(`Duplicate viewport environment: ${normalized.id}`);
    specs.set(normalized.id,normalized);emit();return api;
  };
  // Built-ins are not host code, and the reserved id cannot be overridden.
  // Dispose an internally created grid if descriptor validation or the initial
  // mount fails before a controller can be returned to the caller.
  try {
    for(const spec of BUILTIN_VIEWPORT_ENVIRONMENTS)specs.set(spec.id,normalizeViewportEnvironment(spec,{builtIn:true}));
    for(const spec of environments){const normalized=normalizeViewportEnvironment(spec);if(specs.has(normalized.id))throw new Error(`Duplicate viewport environment: ${normalized.id}`);specs.set(normalized.id,normalized);}
    installStudio();
  } catch(error) {if(ownsGrid)grid.dispose?.();else grid.visible=originalGridVisible;restore();throw error;}
  const listAll=()=>[...specs.values()].sort((a,b)=>a.order-b.order).map(s=>({id:s.id,label:s.label,description:s.description,builtIn:s.builtIn,enabled:s.enabled,active:s.id===currentId}));
  async function change(id,options,request){
    if(disposed||request!==token)return false;
    const spec=specs.get(id);
    if(!spec||!spec.enabled){lastError=`Окружение недоступно: ${id}`;emit();return false;}
    if(id===currentId&&!options.force)return true;
    try{
      const loaded=await spec.load(),mod=typeof loaded?.mount==='function'?loaded:loaded?.default;
      if(typeof mod?.mount!=='function')throw new Error('нет функции mount(ctx)');
      if(disposed||request!==token)return false;
      clear();currentId=id;current=mod;ctx=context();applyGrid();
      await mod.mount(ctx,options);
      if(disposed||request!==token){clear();if(!disposed)installStudio();return false;}
      lastError=null;emit();return true;
    }catch(error){
      if(disposed)return false;
      clear();installStudio();lastError=`Ошибка окружения «${id}»: ${error?.message??error}`;
      try{onError(error);}catch{}emit();return false;
    }
  }
  const api=Object.freeze({
    get currentId(){return currentId;},get current(){return current;},get lastError(){return lastError;},get grid(){return grid;},
    get gridWanted(){return wanted;},
    setGrid(value){wanted=value!==false;applyGrid();emit();},
    list:()=>listAll().filter(item=>item.enabled),listAll,register,
    set(id,options={}){const selected=String(id);requested=selected;const request=++token;queue=queue.catch(()=>{}).then(()=>change(selected,options,request));return queue;},
    async setEnabled(id,enabled){const spec=specs.get(id);if(disposed||!spec||id===BASE_MAP_ID)return false;spec.enabled=!!enabled;
      if(!spec.enabled&&requested===id&&currentId!==id)++token;
      if(!spec.enabled&&currentId===id)await api.set(BASE_MAP_ID);emit();return true;},
    onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    dispose(){if(disposed)return;disposed=true;++token;clear();if(ownsGrid)grid.dispose?.();else grid.visible=originalGridVisible;listeners.clear();invalidate();},
  });
  return api;
}

/** The same environment selector works with the generic and host adapters. */
export function mountViewportEnvironment({host,environment,sections,onSectionChange,onSelect=()=>{},legacyIds=false}={}) {
  if(!environment?.list||!environment?.set||!environment?.onChange)throw new TypeError('viewport environment controller is required');
  const section=mountViewportSection({host,key:'environment',label:'Окружение',sections,onSectionChange});
  const doc=host.ownerDocument,picker=doc.createElement('div');picker.className='v3d-environment-picker viewport-map-picker';
  const label=doc.createElement('div');label.className='v3d-field-label view-menu-setting-heading';label.textContent='Карты';
  const select=doc.createElement('select');select.hidden=true;select.setAttribute('aria-hidden','true');select.tabIndex=-1;
  const options=doc.createElement('div');options.className='v3d-map-options viewport-map-options';options.setAttribute('role','group');options.setAttribute('aria-label','Выбрать карту');
  if(legacyIds){select.id='worldSelect';options.id='viewportMapOptions';}
  const extra=doc.createElement('div');extra.className='v3d-environment-extra';extra.dataset.v3dEnvironmentExtra='';
  picker.append(label,select,options);section.body.append(picker,extra);
  let disposed=false,busy=false;const buttons=new Map();
  const render=()=>{
    const worlds=environment.list(),current=environment.currentId,live=new Set(worlds.map(world=>world.id));
    select.replaceChildren(...worlds.map(world=>{const option=doc.createElement('option');option.value=world.id;option.textContent=world.label;return option;}));select.value=current;select.disabled=busy;
    for(const [id,button] of buttons)if(!live.has(id)){button.remove();buttons.delete(id);}
    worlds.forEach((world,index)=>{
      let button=buttons.get(world.id);
      if(!button){button=doc.createElement('button');button.type='button';button.className='v3d-map-option viewport-map-option';button.dataset.world=world.id;buttons.set(world.id,button);}
      button.textContent=world.label;button.title=world.description??'';button.disabled=busy;button.setAttribute('aria-pressed',String(world.id===current));
      const at=options.children[index];if(at!==button)options.insertBefore(button,at??null);
    });
  };
  async function choose(id){
    if(disposed||busy||!id||id===environment.currentId)return;
    busy=true;render();let ok=false;
    try{ok=await environment.set(id);}catch(error){console.warn('viewport environment selection',error);}
    finally{busy=false;if(!disposed){render();onSelect(ok,environment);}}
  }
  const click=event=>{const button=event.target.closest?.('[data-world]');if(button&&options.contains(button)&&!button.disabled)void choose(button.dataset.world);};
  const change=()=>void choose(select.value);
  options.addEventListener('click',click);select.addEventListener('change',change);
  const off=environment.onChange(render);render();
  return {section,root:section.root,extra,render,dispose(){if(disposed)return;disposed=true;off?.();options.removeEventListener('click',click);select.removeEventListener('change',change);section.dispose();}};
}
