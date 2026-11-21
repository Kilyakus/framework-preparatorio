import {listViewportContributions, subscribeViewportContributions} from '../../../contributions/view-contributions.js';

// A source node cannot belong to two simultaneously mounted viewport menus.
const claimed=new WeakSet();

/** Mount registered viewport contributions as ordered groups, restoring nodes on teardown. */
export function mountViewportContributions({host,root=host?.ownerDocument}={}) {
  if(!host?.ownerDocument || !root?.querySelector)throw new TypeError('viewport contributions require host and search root');
  const doc=host.ownerDocument,entries=new Map();let disposed=false;
  function restore(id,entry){
    entries.delete(id);claimed.delete(entry.node);
    if(entry.anchor.parentNode)entry.anchor.replaceWith(entry.node);
    entry.anchor.remove();entry.wrapper.remove();
    for(const [name,present] of Object.entries(entry.classes))entry.node.classList.toggle(name,present);
    if(entry.role===null)entry.node.removeAttribute('role');else entry.node.setAttribute('role',entry.role);
  }
  function sync(){
    if(disposed)return;
    const items=listViewportContributions(),live=new Set(items.map(item=>item.id));
    for(const [id,entry] of entries)if(!live.has(id))restore(id,entry);
    for(const item of items){
      if(entries.has(item.id))continue;
      let node;
      try {node=root.querySelector(item.selector);} catch(error){console.warn('viewport contribution selector:',error);continue;}
      if(!node || node===host || host.contains(node) || node.contains(host) || claimed.has(node))continue;
      const anchor=doc.createComment(`viewport-contribution:${item.id}`);
      const classes=Object.fromEntries(['tab-content','active','menu-contribution-body','viewport-menu-contribution-body'].map(name=>[name,node.classList.contains(name)]));
      const role=node.getAttribute('role');node.before(anchor);
      node.classList.remove('tab-content','active');node.classList.add('menu-contribution-body','viewport-menu-contribution-body');node.setAttribute('role','group');
      const wrapper=doc.createElement('section');wrapper.className='menu-contribution viewport-menu-contribution';
      wrapper.dataset.menuContribution=item.id;wrapper.dataset.viewportContribution=item.id;wrapper.dataset.menuOwner=item.owner;wrapper.dataset.viewportOwner=item.owner;
      wrapper.style.order=String(item.order);wrapper.setAttribute('aria-label',item.label);
      const title=doc.createElement('strong');title.className='menu-contribution-title viewport-menu-contribution-title';title.textContent=item.label;
      wrapper.append(title,node);host.append(wrapper);claimed.add(node);entries.set(item.id,{node,anchor,wrapper,classes,role});
    }
  }
  let observer,off=()=>{};
  try {
    off=subscribeViewportContributions(sync);
    const Observer=doc.defaultView?.MutationObserver;
    if(Observer){observer=new Observer(sync);observer.observe(doc.body??doc.documentElement,{childList:true,subtree:true});}
    sync();
  }catch(error){off();observer?.disconnect();for(const [id,entry] of [...entries])restore(id,entry);throw error;}
  return {sync,dispose(){if(disposed)return;disposed=true;off();observer?.disconnect();for(const [id,entry] of [...entries])restore(id,entry);}};
}
