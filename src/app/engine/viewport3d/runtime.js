/**
 * viewport3d: the same scene/renderer/camera, resize, frame and plugin runtime
 * in every host. Three.js is injected: this module never imports its own copy.
 * Project-specific lights, geometry, tools and UI belong to plugins.
 */
export const VIEWPORT3D_ID = 'viewport3d';
const isId = id => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id);
const list = value => {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError('viewport3d dependencies must be arrays');
  return [...new Set(value)];
};

function descriptor(plugin) {
  if (!plugin || !isId(plugin.id) || typeof plugin.activate !== 'function')
    throw new TypeError('viewport3d plugin needs a kebab-case id and activate(context)');
  const requirements = plugin.requires ?? {};
  if (typeof requirements !== 'object' || Array.isArray(requirements))
    throw new TypeError(`viewport3d plugin ${plugin.id}: requires must be an object`);
  const result = { id: plugin.id, activate: plugin.activate,
    scopes: list(requirements.scopes), apis: list(requirements.apis), plugins: list(requirements.plugins) };
  for (const [kind, values] of Object.entries({scopes:result.scopes, apis:result.apis, plugins:result.plugins})) {
    if (values.some(value => typeof value !== 'string' || !value.trim()))
      throw new TypeError(`viewport3d plugin ${plugin.id}: invalid ${kind} dependency`);
  }
  if (result.plugins.includes(result.id)) throw new Error(`viewport3d plugin ${result.id} depends on itself`);
  return result;
}

/**
 * Synchronous activation makes composition deterministic. Import/prepare async
 * resources BEFORE registerPlugins; a plugin can start its own async work but
 * must cancel it with context.signal/defer. Missing dependencies mean waiting,
 * not an error. Cycles, duplicates and failed activation are errors.
 */
export function createViewport3D(options = {}) {
  const { THREE, container = null, canvas = null } = options;
  if (!THREE?.Scene || !THREE?.WebGLRenderer) throw new TypeError('viewport3d requires host THREE');
  if (!container && !canvas && !options.renderer) throw new TypeError('viewport3d requires a container or canvas');
  const scene = options.scene ?? new THREE.Scene();
  let camera = options.camera;
  if (!camera) {
    const spec = options.cameraOptions ?? {};
    const kind = spec.kind ?? 'perspective';
    if (kind !== 'perspective' && kind !== 'orthographic') throw new TypeError(`Unknown viewport3d camera: ${kind}`);
    const Constructor = kind === 'orthographic' ? THREE.OrthographicCamera : THREE.PerspectiveCamera;
    camera = new Constructor(...(spec.args ?? (kind === 'orthographic' ? [-1, 1, 1, -1, .1, 100] : [45, 1, .1, 100])));
  }
  let renderer = options.renderer;
  const ownsRenderer = !renderer || options.ownRenderer === true;
  if (!renderer) {
    const attributes = {...options.rendererOptions, ...(canvas ? {canvas} : {})};
    try { renderer = new THREE.WebGLRenderer(attributes); }
    catch (error) {
      if (!options.retryWithoutAntialias || !attributes.antialias) throw error;
      try { renderer = new THREE.WebGLRenderer({...attributes, antialias:false}); }
      catch { throw error; }
    }
  }
  const element = renderer.domElement ?? canvas ?? null;
  let appended = false;
  try {
    const ratio = options.pixelRatio ?? Math.min(typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1), options.maxPixelRatio ?? 2);
    renderer.setPixelRatio?.(ratio);
    options.configure?.({THREE, scene, camera, renderer, canvas:element});
    if (!canvas && element && container && element.parentNode !== container) {
      container.appendChild(element); appended = true;
    }
  } catch (error) {
    if (ownsRenderer) renderer.dispose?.();
    if (appended) element?.remove?.();
    throw error;
  }

  const plugins = new Map(), active = new Map(), scopes = new Set(options.scopes ?? []);
  const apis = Object.assign(Object.create(null), options.apis ?? {});
  const beforeResize = new Set(), afterResize = new Set();
  const beforeRender = new Set(), afterRender = new Set(), disposeHooks = new Set();
  let disposed = false, reconciling = false, observer = null, windowResize = null;
  let loop = null, frame = null, loopDriver = null, loopGeneration = 0;
  const scopeAccess = Object.freeze({has:id => scopes.has(id), list:() => [...scopes]});
  const checkLive = () => { if (disposed) throw new Error('viewport3d is disposed'); };
  const warn = error => console.warn('viewport3d cleanup:', error);
  const runCleanup = record => {
    record.controller.abort();
    for (const cleanup of record.cleanups.reverse()) try { cleanup(); } catch (error) { warn(error); }
  };
  function assertAcyclic() {
    const visiting = new Set(), done = new Set();
    function visit(id) {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new Error(`viewport3d plugin dependency cycle at ${id}`);
      visiting.add(id);
      for (const dep of plugins.get(id)?.plugins ?? []) if (plugins.has(dep)) visit(dep);
      visiting.delete(id); done.add(id);
    }
    for (const id of plugins.keys()) visit(id);
  }
  const available = p => p.scopes.every(id => scopes.has(id)) &&
    p.apis.every(id => Object.hasOwn(apis,id) && apis[id] != null);
  function desiredIds() {
    const desired = new Set();
    let changed;
    do {
      changed = false;
      for (const p of plugins.values()) if (!desired.has(p.id) && available(p) && p.plugins.every(id => desired.has(id))) {
        desired.add(p.id); changed = true;
      }
    } while (changed);
    return desired;
  }
  function deactivate(id) {
    const record = active.get(id); if (!record) return;
    active.delete(id); runCleanup(record);
  }
  function reconcile(restart = new Set()) {
    if (reconciling) throw new Error('viewport3d plugin composition is already changing');
    reconciling = true;
    const newlyActive = [];
    try {
      const desired = desiredIds();
      // Changed APIs invalidate direct users AND every transitive dependent.
      let changed;
      do {
        changed = false;
        for (const p of plugins.values()) if (!restart.has(p.id) && p.plugins.some(id => restart.has(id))) {
          restart.add(p.id); changed = true;
        }
      } while (changed);
      for (const id of [...active.keys()].reverse()) if (!desired.has(id) || restart.has(id)) deactivate(id);
      while (true) {
        const next = [...plugins.values()].find(p => desired.has(p.id) && !active.has(p.id) && p.plugins.every(id => active.has(id)));
        if (!next) break;
        const record = {controller:new AbortController(), cleanups:[], api:null};
        const defer = fn => { if (typeof fn !== 'function') throw new TypeError('defer requires a function'); record.cleanups.push(fn); return fn; };
        try {
          const result = next.activate({viewport, scopes:scopeAccess, apis:Object.freeze({...apis}), signal:record.controller.signal, defer});
          if (result && typeof result.then === 'function') {
            // Activation itself must be synchronous so removal cannot race it.
            result.catch?.(warn);
            throw new TypeError(`viewport3d plugin ${next.id}: activate must be synchronous`);
          }
          if (typeof result === 'function') defer(result);
          else if (result != null) {
            if (typeof result !== 'object') throw new TypeError(`viewport3d plugin ${next.id}: invalid result`);
            if (result.dispose != null && typeof result.dispose !== 'function') throw new TypeError(`viewport3d plugin ${next.id}: dispose must be a function`);
            if (result.dispose) defer(() => result.dispose());
            record.api = result.api ?? null;
          }
        } catch (error) { runCleanup(record); throw error; }
        active.set(next.id, record); newlyActive.push(next.id);
      }
    } catch (error) {
      for (const id of newlyActive.reverse()) deactivate(id);
      throw error;
    } finally { reconciling = false; }
  }
  function registerPlugins(items) {
    checkLive();
    if (reconciling) throw new Error('viewport3d plugin composition is already changing');
    const additions = items.map(descriptor), ids = new Set();
    for (const p of additions) {
      if (plugins.has(p.id) || ids.has(p.id)) throw new Error(`Duplicate viewport3d plugin: ${p.id}`);
      ids.add(p.id);
    }
    for (const p of additions) plugins.set(p.id,p);
    try { assertAcyclic(); reconcile(); }
    catch (error) { for (const p of additions) plugins.delete(p.id); throw error; }
    return viewport;
  }
  function setApi(id,value) {
    checkLive();
    if (typeof id !== 'string' || !id) throw new TypeError('viewport3d API needs a name');
    const had = Object.hasOwn(apis,id), previous=apis[id];
    if ((value == null && !had) || (had && value === previous)) return;
    if (value == null) delete apis[id]; else apis[id]=value;
    const restart = new Set([...plugins.values()].filter(p=>p.apis.includes(id)).map(p=>p.id));
    try { reconcile(restart); }
    catch (error) {
      if (had) apis[id]=previous; else delete apis[id];
      try { reconcile(restart); } catch (rollbackError) { warn(rollbackError); }
      throw error;
    }
  }
  function setScopeAvailable(id, value) {
    checkLive(); const had=scopes.has(id), enabled=!!value;
    if (had===enabled) return;
    if (enabled) scopes.add(id); else scopes.delete(id);
    try { reconcile(); }
    catch (error) {
      if (had) scopes.add(id); else scopes.delete(id);
      try { reconcile(); } catch (rollbackError) { warn(rollbackError); }
      throw error;
    }
  }
  function resize() {
    checkLive();
    const host = container ?? element;
    const width = host?.clientWidth ?? 0, height = host?.clientHeight ?? 0;
    if (options.ignoreZeroSize && (!width || !height)) return false;
    const size = {width:Math.max(1,width), height:Math.max(1,height), viewport};
    for (const fn of [...beforeResize]) fn(size);
    renderer.setSize(size.width, size.height, false);
    for (const fn of [...afterResize]) fn(size);
    return true;
  }
  function disconnectResize() {
    observer?.disconnect(); observer=null;
    if (windowResize && typeof window !== 'undefined') window.removeEventListener('resize',windowResize);
    windowResize=null;
  }
  function observeResize({window:watchWindow=false, immediate=true} = {}) {
    checkLive(); disconnectResize();
    const Resize = globalThis.ResizeObserver;
    if (Resize && container) { observer = new Resize(() => { if (!disposed) resize(); }); observer.observe(container); }
    if (watchWindow && typeof window !== 'undefined') { windowResize=()=>{ if (!disposed) resize(); }; window.addEventListener('resize',windowResize); }
    if (immediate) resize();
    return disconnectResize;
  }
  function onResize(fn,{phase='after'} = {}) {
    checkLive(); if (typeof fn !== 'function' || !['before','after'].includes(phase)) throw new TypeError('Invalid resize hook');
    const hooks=phase==='before'?beforeResize:afterResize; hooks.add(fn); return ()=>hooks.delete(fn);
  }
  function stop() {
    if (!loop) return;
    loop=null; loopGeneration++;
    if (loopDriver==='renderer') renderer.setAnimationLoop?.(null);
    else if (frame != null) globalThis.cancelAnimationFrame?.(frame);
    frame=null; loopDriver=null;
  }
  function start(callback,{driver='raf'} = {}) {
    checkLive();
    if (typeof callback !== 'function' || !['raf','renderer'].includes(driver)) throw new TypeError('Invalid viewport3d frame loop');
    if (driver==='renderer' && typeof renderer.setAnimationLoop!=='function') throw new Error('Renderer has no animation loop');
    if (driver==='raf' && typeof globalThis.requestAnimationFrame!=='function') throw new Error('requestAnimationFrame is unavailable');
    stop(); loop=callback; loopDriver=driver; const generation=++loopGeneration;
    if (driver==='renderer') renderer.setAnimationLoop((...args)=>{ if (generation===loopGeneration) loop?.(...args); });
    else {
      const tick = time => { if (generation!==loopGeneration || !loop) return; loop(time); if (generation===loopGeneration && loop) frame=globalThis.requestAnimationFrame(tick); };
      frame=globalThis.requestAnimationFrame(tick);
    }
    return stop;
  }
  function onRender(fn,{phase='after'} = {}) {
    checkLive(); if (typeof fn !== 'function' || !['before','after'].includes(phase)) throw new TypeError('Invalid render hook');
    const hooks=phase==='before'?beforeRender:afterRender; hooks.add(fn); return ()=>hooks.delete(fn);
  }
  const viewport = Object.freeze({
    id:VIEWPORT3D_ID, THREE, container, scene, camera, renderer, canvas:element,
    render(renderScene=scene,renderCamera=camera) {
      checkLive();const event={viewport,scene:renderScene,camera:renderCamera};
      for(const fn of [...beforeRender])fn(event);
      renderer.render(renderScene,renderCamera);
      for(const fn of [...afterRender])fn(event);
    },
    resize, observeResize, disconnectResize, onResize, onRender, start, stop,
    onDispose(fn) {checkLive();if(typeof fn!=='function')throw new TypeError('Invalid dispose hook');disposeHooks.add(fn);return ()=>disposeHooks.delete(fn);},
    registerPlugin(plugin) {return registerPlugins([plugin]);}, registerPlugins,
    unregisterPlugin(id) {checkLive(); if(!plugins.has(id))return false; plugins.delete(id); reconcile(); return true;},
    setApi, setScopeAvailable,
    getPlugin(id) {return active.get(id)?.api ?? null;},
    listPlugins() {return [...plugins.values()].map(p=>({id:p.id, active:active.has(p.id), requires:{scopes:[...p.scopes],apis:[...p.apis],plugins:[...p.plugins]}}));},
    get scopes() {return scopeAccess;},
    get disposed() {return disposed;},
    dispose() {
      if (disposed) return; disposed=true; stop(); disconnectResize();
      for (const cleanup of [...disposeHooks].reverse()) try { cleanup(); } catch(error) { warn(error); }
      disposeHooks.clear();
      for (const id of [...active.keys()].reverse()) deactivate(id);
      plugins.clear(); beforeResize.clear(); afterResize.clear(); beforeRender.clear(); afterRender.clear();
      if (ownsRenderer) try { renderer.dispose?.(); } catch(error) { warn(error); }
      if (appended) element?.remove?.();
    },
  });
  return viewport;
}
