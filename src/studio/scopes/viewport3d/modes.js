/** Built-in viewport mode and tool. Applications can add their own modes/tools. */
export const VIEWPORT3D_ORBIT_TOOL = Object.freeze({
  id: 'orbit', label: 'Обзор', title: 'Обзор — вращать и приближать камеру',
  icon: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M4 12h16M12 4v16M7 6.2c2 1 8 1 10 0M7 17.8c2-1 8-1 10 0M12 4c-4 3-4 13 0 16M12 4c4 3 4 13 0 16"></path></svg>',
});
export const VIEWPORT3D_VIEW_MODE = Object.freeze({
  id: 'view', label: 'Просмотр', description: 'Свободный обзор сцены.',
  tools: Object.freeze(['orbit']), defaultTool: 'orbit',
});
const validId = id => typeof id === 'string' && /^[a-z][a-z0-9-]*$/.test(id);

/**
 * No DOM or Three.js dependency. Mode/tool callbacks return false to reject a
 * change. Each mode remembers its own tool. `notifyHost:false` mirrors an
 * external host change without calling it back. No application mode is built in.
 */
export function createViewportModes({ modes = [], tools = [], initialMode = 'view', initialTool,
  onModeChange = () => true, onToolChange = () => true, onChange = () => {} } = {}) {
  const toolMap = new Map([[VIEWPORT3D_ORBIT_TOOL.id, VIEWPORT3D_ORBIT_TOOL]]);
  const modeMap = new Map([[VIEWPORT3D_VIEW_MODE.id, VIEWPORT3D_VIEW_MODE]]);
  const available = new Map([['view', true]]), desired = new Map(), listeners = new Set();
  let disposed = false;
  function addTool(tool) {
    if (!validId(tool?.id) || !tool.label || toolMap.has(tool.id)) throw new Error(`Invalid or duplicate viewport tool: ${tool?.id}`);
    toolMap.set(tool.id, Object.freeze({...tool}));
  }
  function addMode(mode) {
    if (!validId(mode?.id) || !mode.label || modeMap.has(mode.id) || !Array.isArray(mode.tools) || !mode.tools.length ||
        mode.tools.some(id => !toolMap.has(id)) || !mode.tools.includes(mode.defaultTool ?? mode.tools[0]))
      throw new Error(`Invalid or duplicate viewport mode: ${mode?.id}`);
    modeMap.set(mode.id, Object.freeze({...mode, tools:Object.freeze([...mode.tools]), defaultTool:mode.defaultTool ?? mode.tools[0]}));
    available.set(mode.id, mode.available !== false);
  }
  for (const tool of tools) addTool(tool);
  for (const mode of modes) addMode(mode);
  let mode = modeMap.has(initialMode) && available.get(initialMode) ? initialMode : 'view';
  let tool = modeMap.get(mode).tools.includes(initialTool) ? initialTool : modeMap.get(mode).defaultTool;
  desired.set(mode, tool);
  const snapshot = () => ({mode, tool, modes:[...modeMap.values()].map(item=>({...item,available:available.get(item.id)})),
    tools:modeMap.get(mode).tools.map(id=>toolMap.get(id))});
  function publish(reason) { const state=snapshot(); for(const fn of [...listeners]) fn(state,reason); onChange(state,reason); }
  function setMode(id, {notifyHost=true, force=false} = {}) {
    if (disposed || !modeMap.has(id) || !available.get(id)) return false;
    if (!force && id===mode) return true;
    const next=modeMap.get(id), nextTool=next.tools.includes(desired.get(id))?desired.get(id):next.defaultTool;
    if (notifyHost && onModeChange(id)===false) return false;
    if (notifyHost && onToolChange(nextTool,id)===false) {
      // Restore the previous host mode if its requested tool was rejected.
      onModeChange(mode); onToolChange(tool,mode); return false;
    }
    mode=id;tool=nextTool;desired.set(id,tool);publish('mode');return true;
  }
  function setTool(id,{notifyHost=true,force=false}={}) {
    if(disposed || !modeMap.get(mode).tools.includes(id))return false;
    if(!force && tool===id)return true;
    if(notifyHost && onToolChange(id,mode)===false)return false;
    tool=id;desired.set(mode,id);publish('tool');return true;
  }
  return Object.freeze({
    get value(){return snapshot();}, setMode, setTool,
    registerTool(tool){if(disposed)throw new Error('viewport modes disposed');addTool(tool);publish('catalog');},
    registerMode(item){if(disposed)throw new Error('viewport modes disposed');addMode(item);publish('catalog');},
    removeMode(id){if(id==='view'||!modeMap.has(id))return false;if(mode===id&&!setMode('view'))return false;modeMap.delete(id);available.delete(id);desired.delete(id);publish('catalog');return true;},
    setAvailable(id,value){if(id==='view'||!modeMap.has(id))return false;value=!!value;if(available.get(id)===value)return true;if(!value&&mode===id&&!setMode('view'))return false;available.set(id,value);publish('catalog');return true;},
    subscribe(fn,{immediate=true}={}){if(disposed)throw new Error('viewport modes disposed');listeners.add(fn);if(immediate)fn(snapshot(),'init');return()=>listeners.delete(fn);},
    dispose(){if(disposed)return;disposed=true;listeners.clear();},
  });
}

/** Attach the Preparatorio selector and vertical tool rail to host-provided slots. */
export function mountViewportModes({modes, modeHost, toolHost, selectId = '', ui} = {}) {
  if (!modes || !modeHost?.ownerDocument || !toolHost?.ownerDocument) throw new TypeError('viewport mode slots are required');
  if (typeof ui?.createCustomSelect !== 'function') throw new TypeError('viewport modes require ui.createCustomSelect from uix-preparatorio');
  const doc=modeHost.ownerDocument, abort=new AbortController(), signal=abort.signal;
  const selector=ui.createCustomSelect({label:'Режим просмотра', options:[], onChange(value){
    if(!modes.setMode(value)) selector.setValue(modes.value.mode);
    selector.trigger.value=modes.value.mode;
  }});
  const select=selector.trigger;selector.element.classList.add('v3d-mode-select');
  if(selectId)select.id=selectId;modeHost.append(selector.element);
  toolHost.setAttribute('role','toolbar');toolHost.setAttribute('aria-label','Инструменты просмотра');toolHost.setAttribute('aria-orientation','vertical');
  toolHost.classList.add('v3d-tools');
  const buttons=new Map();let signature='';
  function sync(state) {
    const options=state.modes.map(item=>({value:item.id,label:item.label,description:item.description||'',disabled:!item.available}));
    const next=JSON.stringify(options);
    if(next!==signature){signature=next;selector.setOptions(options);}
    if(selector.value!==state.mode)selector.setValue(state.mode);
    // Keep the legacy button ID useful to hosts without introducing a hidden native select.
    select.value=state.mode;
    const visible=new Set(state.tools.map(item=>item.id));
    for(const item of state.tools){
      let button=buttons.get(item.id);
      if(!button){
        button=doc.createElement('button');button.type='button';button.className='v3d-tool viewport-tool';button.dataset.viewportTool=item.id;
        button.setAttribute('aria-label',item.label);button.title=item.title||item.label;
        // Icons are trusted application descriptors, not user content.
        if(item.icon)button.innerHTML=item.icon;
        const label=doc.createElement('span');label.textContent=item.label;button.append(label);
        button.addEventListener('click',event=>{modes.setTool(item.id);if(event.detail>0)button.blur();},{signal});
        button.addEventListener('keydown',event=>{
          if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
          const list=[...toolHost.querySelectorAll('[data-viewport-tool]')].filter(node=>!node.hidden),index=list.indexOf(button);
          const next=event.key==='Home'?0:event.key==='End'?list.length-1:(index+(event.key==='ArrowDown'?1:-1)+list.length)%list.length;
          event.preventDefault();list[next]?.focus();list[next]?.click();
        },{signal});
        buttons.set(item.id,button);toolHost.append(button);
      }
    }
    for(const [id,button] of buttons){button.hidden=!visible.has(id);const active=!button.hidden&&id===state.tool;
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.tabIndex=active?0:-1;}
  }
  let off=()=>{},observer=null,disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;off();abort.abort();observer?.disconnect();selector.destroy();for(const button of buttons.values())button.remove();buttons.clear();};
  try {
    off=modes.subscribe(sync,{immediate:false});sync(modes.value);
    // Dock tab switches can hide a selector without a pointer event. Avoid a
    // floating portal when its anchor becomes hidden or is detached.
    const Observer=doc.defaultView?.ResizeObserver;
    observer=Observer?new Observer(()=>{if(!select.isConnected||!select.getClientRects().length)selector.close();}):null;
    observer?.observe(modeHost);
    return {select,selectController:selector,dispose};
  } catch(error){dispose();throw error;}
}
