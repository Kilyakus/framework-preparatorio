import {mountViewportSection} from './sections.js';

/**
 * Named controls are contributions owned by their providers, not a hard-coded
 * list of features in the framework. Providers can register/unregister while
 * the menu is open; UI nodes for surviving entries remain stable.
 */
export function createViewportDisplay() {
  const items=new Map(),listeners=new Set();let disposed=false;
  const notify=()=>{if(!disposed)for(const fn of [...listeners])fn();};
  return Object.freeze({
    register(item){
      if(disposed)throw new Error('viewport display disposed');
      if(!item || !/^[a-z][a-z0-9-]*$/.test(item.id??'') || !item.label || typeof item.get!=='function' || typeof item.set!=='function')
        throw new TypeError('viewport display control needs id, label, get and set');
      if(items.has(item.id))throw new Error(`Duplicate viewport display control: ${item.id}`);
      const entry={...item,order:Number.isFinite(item.order)?item.order:100};items.set(entry.id,entry);notify();
      return ()=>{if(items.get(entry.id)===entry){items.delete(entry.id);notify();}};
    },
    list(){return [...items.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));},
    refresh:notify,
    subscribe(fn,{immediate=true}={}){if(disposed)throw new Error('viewport display disposed');listeners.add(fn);if(immediate)fn();return()=>listeners.delete(fn);},
    dispose(){if(disposed)return;disposed=true;items.clear();listeners.clear();},
  });
}

export function mountViewportDisplay({host,display,sections,onSectionChange}={}) {
  if(!display?.list)throw new TypeError('viewport display controller is required');
  const section=mountViewportSection({host,key:'display',label:'Отображение',sections,onSectionChange});
  const doc=host.ownerDocument,rows=new Map();let disposed=false;
  const sync=()=>{
    const items=display.list(),live=new Set(items.map(item=>item.id));
    for(const [id,row] of rows)if(!live.has(id)){row.label.remove();rows.delete(id);}
    items.forEach((item,index)=>{
      let row=rows.get(item.id);
      if(!row){
        const label=doc.createElement('label');label.className='v3d-check viewport-check';label.dataset.v3dDisplayItem=item.id;
        const input=doc.createElement('input');input.type='checkbox';input.dataset.v3dDisplayControl=item.id;
        if(item.inputId)input.id=item.inputId;
        if(item.requires?.length)input.dataset.requiresScope=item.requires.join(' ');
        const text=doc.createElement('span');text.textContent=String(item.label);label.append(input,text);
        const onChange=()=>{const current=display.list().find(value=>value.id===item.id);if(current){current.set(input.checked);display.refresh();}};
        input.addEventListener('change',onChange);row={label,input,text,onChange};rows.set(item.id,row);
      }
      row.text.textContent=String(item.label);row.label.title=item.description??'';
      row.input.checked=!!item.get();row.input.disabled=typeof item.disabled==='function'?!!item.disabled():!!item.disabled;
      // Keep existing rows attached (and focused) unless their order changed.
      const at=section.body.children[index];if(at!==row.label)section.body.insertBefore(row.label,at??null);
    });
    section.body.dataset.empty=String(items.length===0);
  };
  const off=display.subscribe(sync);
  return {section,root:section.root,refresh:sync,dispose(){if(disposed)return;disposed=true;off();for(const row of rows.values())row.input.removeEventListener('change',row.onChange);rows.clear();section.dispose();}};
}

/** A studio-owned row exists only while the Studio environment is active. */
export function contributeStudioGrid({display,environment,get,set,inputId,description='Бесконечная сетка базовой карты «Студия»'}={}) {
  if(!display?.register || !environment?.onChange || typeof get!=='function' || typeof set!=='function')
    throw new TypeError('studio grid contribution requires display, environment, get and set');
  let remove=null,disposed=false;
  const sync=()=>{
    const active=environment.currentId==='studio';
    if(active&&!remove)remove=display.register({id:'floor-grid',label:'Сетка пола',description,order:10,inputId,get,set});
    else if(!active&&remove){const unregister=remove;remove=null;unregister();}
    display.refresh();
  };
  const off=environment.onChange(sync);sync();
  return {refresh:sync,dispose(){if(disposed)return;disposed=true;off?.();remove?.();remove=null;}};
}
