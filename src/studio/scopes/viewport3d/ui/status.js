/** Ordered status contributions for the viewport. Pure composition is usable
 * without a DOM; mounting does not create a renderer or an animation loop. */
const SIDES = new Set(['left', 'right']);
const isObject = x => x && typeof x === 'object' && !Array.isArray(x);
const idOf = x => typeof x === 'string' && /^[a-z][a-z0-9-]*$/.test(x);
const validate = (item, kind) => {
  if (!isObject(item) || !idOf(item.id)) throw new TypeError(`viewport status ${kind} needs a kebab-case id`);
  if (item.row != null && (!Number.isInteger(item.row) || item.row < 0)) throw new TypeError(`viewport status ${item.id}: row must be a non-negative integer`);
  if (item.side != null && !SIDES.has(item.side)) throw new TypeError(`viewport status ${item.id}: side must be left or right`);
  if (item.order != null && !Number.isFinite(item.order)) throw new TypeError(`viewport status ${item.id}: order must be finite`);
  if (item.group != null && !idOf(item.group)) throw new TypeError(`viewport status ${item.id}: invalid group`);
};

/** Layers merge by id, fields are inherited; later layers override earlier
 * fields. `remove:true` deletes an item/group and `enabled:false` hides it. */
export function composeViewportStatus(...layers) {
  const items = new Map(), groups = new Map();
  for (const layer of layers.flat()) {
    if (layer == null) continue;
    if (!isObject(layer)) throw new TypeError('viewport status layer must be an object');
    for (const [kind, map] of [['groups', groups], ['items', items]]) {
      if (layer[kind] != null && !Array.isArray(layer[kind])) throw new TypeError(`viewport status ${kind} must be an array`);
      const seen = new Set();
      for (const entry of layer[kind] ?? []) {
        validate(entry, kind);
        if (seen.has(entry.id)) throw new Error(`duplicate viewport status ${kind} id: ${entry.id}`);
        seen.add(entry.id);
        if (entry.remove === true) map.delete(entry.id);
        else map.set(entry.id, {...map.get(entry.id), ...entry, remove:undefined});
      }
    }
  }
  for (const item of items.values()) if (item.group && !groups.has(item.group))
    throw new Error(`viewport status ${item.id}: unknown group ${item.group}`);
  return {groups:[...groups.values()],items:[...items.values()]};
}

function position(ctx) {
  const object=ctx.activeObject;
  if (!object) return 'XYZ —';
  let p=null;
  if (object.getWorldPosition && ctx.viewport.THREE?.Vector3) {
    object.updateWorldMatrix?.(true, false);
    p=object.getWorldPosition(new ctx.viewport.THREE.Vector3());
  }
  if (!p || ![p.x,p.y,p.z].every(Number.isFinite)) return 'XYZ —';
  const n=v=>Math.abs(v)<.005?'0.00':v.toFixed(2);
  return `XYZ ${n(p.x)}  ${n(p.y)}  ${n(p.z)}`;
}
export const VIEWPORT3D_STATUS_DEFAULTS = Object.freeze({
  groups:Object.freeze([]),
  items:Object.freeze([
    Object.freeze({id:'position',row:0,side:'right',order:50,text:position,title:'Мировая позиция активного элемента'}),
    Object.freeze({id:'fps',row:0,side:'right',order:100,text:({fps})=>`FPS ${fps ?? '—'}`,title:'Частота отрисовки viewport'}),
  ]),
});
export const VIEWPORT3D_STATUS_TEMPLATE = '<footer class="v3d-status" data-v3d-status role="status" aria-live="off" aria-label="Состояние 3D просмотра"></footer>';

/** `layers` are base-to-derived. `addLayer` enables independently registered
 * contributions and returns an unregister function. Render hooks are reused;
 * `update()` lets a demand-rendered host reflect non-render changes. */
export function mountViewportStatus({root, viewport, layers=[], defaults=true, getActiveObject, getContext=()=>({}),
  interval=200, now=()=>globalThis.performance?.now?.() ?? Date.now(), onError=()=>{}}={}) {
  if (!root?.ownerDocument || !viewport) throw new TypeError('viewport status needs a DOM root and viewport');
  if (!Number.isFinite(interval) || interval < 0) throw new TypeError('viewport status interval must be non-negative');
  if (!Array.isArray(layers)) throw new TypeError('viewport status layers must be an array');
  const originalHidden=root.hidden, originalChildren=[...root.childNodes];
  const initial=[...(defaults ? [VIEWPORT3D_STATUS_DEFAULTS] : []), ...layers];
  const extensions=[];let spec=composeViewportStatus(initial), disposed=false;
  let frames=0, fps=null, fpsAt=now(), lastPaint=-Infinity;
  function setSpec() { spec=composeViewportStatus(initial, ...extensions.map(x=>x.layer)); }
  const doc=root.ownerDocument;
  function paint() {
    if (disposed) return;
    const activeObject=getActiveObject ? getActiveObject() : viewport.activeObject ?? null;
    const ctx={...getContext(),viewport,activeObject,fps};
    const groups=new Map(spec.groups.map(g=>[g.id,g]));const rows=new Map();
    const evalValue=(v,item)=>{try{return typeof v==='function'?v(ctx):v}catch(error){onError(error,item);return null}};
    for (const [i,item] of spec.items.entries()) {
      const group=item.group?groups.get(item.group):null;
      if (item.enabled===false || group?.enabled===false || evalValue(item.visible,item)===false) continue;
      const text=evalValue(item.text,item);if(text==null || text==='')continue;
      const row=item.row ?? group?.row ?? 0, side=item.side ?? group?.side ?? 'left';
      const slotKey=item.group ? `g:${item.group}` : `i:${item.id}`;
      if(!rows.has(row))rows.set(row,{left:new Map(),right:new Map()});
      const sideSlots=rows.get(row)[side];
      if(!sideSlots.has(slotKey))sideSlots.set(slotKey,{order:group?.order ?? item.order ?? 0,seq:i,group,items:[]});
      sideSlots.get(slotKey).items.push({item,text:String(text),seq:i,title:evalValue(item.title,item)});
    }
    const nodes=[];
    for(const [row,sides] of [...rows].sort((a,b)=>a[0]-b[0])){
      const line=doc.createElement('div');line.className='v3d-status-row';line.dataset.v3dStatusRow=String(row);
      for(const side of ['left','right']){
        const section=doc.createElement('div');section.className=`v3d-status-side v3d-status-${side}`;section.dataset.v3dStatusSide=side;
        const sorted=[...sides[side].values()].sort((a,b)=>a.order-b.order||a.seq-b.seq);
        for(const slot of sorted){
          let container=section;
          if(slot.group){container=doc.createElement('span');container.className='v3d-status-group';container.dataset.v3dStatusGroup=slot.group.id;section.append(container);}
          const sortedItems=slot.items.sort((a,b)=>(a.item.order??0)-(b.item.order??0)||a.seq-b.seq);
          sortedItems.forEach(({item,text,title},index)=>{
            if(index && slot.group){const sep=doc.createElement('span');sep.className='v3d-status-separator';sep.setAttribute('aria-hidden','true');sep.textContent=slot.group.separator ?? ' · ';container.append(sep);}
            const node=doc.createElement('span');node.className='v3d-status-item';node.dataset.v3dStatusItem=item.id;node.textContent=text;
            if(title!=null)node.title=String(title);container.append(node);
          });
        }
        line.append(section);
      }
      nodes.push(line);
    }
    const fragment=doc.createElement('div');fragment.append(...nodes);
    if(root.innerHTML!==fragment.innerHTML)root.replaceChildren(...fragment.childNodes);
    root.hidden=nodes.length===0;
  }
  const update=()=>{lastPaint=now();paint();};
  const onFrame=()=>{
    const t=now();frames++;
    if(t-fpsAt>=1000){fps=Math.round(frames*1000/(t-fpsAt));frames=0;fpsAt=t;}
    if(t-lastPaint>=interval){lastPaint=t;paint();}
  };
  let offRender=()=>{},offSelection=()=>{},offDispose=()=>{};
  try {
    offRender=viewport.onRender?.(onFrame) ?? offRender;
    offSelection=viewport.onActiveObjectChange?.(update) ?? offSelection;
    offDispose=viewport.onDispose?.(()=>dispose()) ?? offDispose;
    update();
  } catch(error) {offRender();offSelection();offDispose();root.replaceChildren(...originalChildren);root.hidden=originalHidden;throw error;}
  function dispose(){if(disposed)return;disposed=true;offRender();offSelection();offDispose();root.replaceChildren(...originalChildren);root.hidden=originalHidden;}
  return {update, addLayer(layer){
    if(disposed)throw new Error('viewport status is disposed');
    const entry={layer};extensions.push(entry);
    try {setSpec();update();} catch(error) {extensions.pop();setSpec();throw error;}
    let active=true;return ()=>{if(!active||disposed)return false;const index=extensions.indexOf(entry);extensions.splice(index,1);try{setSpec();update();}catch(error){extensions.splice(index,0,entry);setSpec();throw error;}active=false;return true;};
  }, get config(){return composeViewportStatus(spec);},dispose};
}
