/** App-owned CSS classes for the shared viewport. Selectors are stable hooks. */
const SLOTS=Object.freeze({
  scope:'[data-viewport3d-scope]',header:'.v3d-header',modeHost:'[data-v3d-mode-host]',
  navigation:'.v3d-navigation',navigationButton:'.v3d-navigation button',
  settingsMenu:'.v3d-graphics-menu',settingsToggle:'[data-v3d-graphics-toggle]',settingsPanel:'[data-v3d-graphics-panel]',
  status:'[data-v3d-status]',statusRow:'.v3d-status-row',statusItem:'.v3d-status-item',statusGroup:'.v3d-status-group',
  stage:'[data-v3d-stage]',toolHost:'[data-v3d-tool-host]',tool:'[data-viewport-tool]',
  gizmo:'.b-nav-gizmo',gizmoAxis:'.b-gizmo-axis',gizmoCenter:'.b-gizmo-center',
  section:'.v3d-section',sectionHeading:'.v3d-section-heading',sectionToggle:'.v3d-section-toggle',
  sectionActions:'.v3d-section-actions',sectionBody:'.v3d-section-body',
  graphics:'.v3d-graphics',displayItem:'[data-v3d-display-item]',environmentOption:'.v3d-map-option',
  contribution:'.viewport-menu-contribution',contributionTitle:'.viewport-menu-contribution-title',
});

/** Apply host-provided classes to both initial and dynamically mounted nodes. */
export function mountViewportClasses({root,panel,classes={}}={}) {
  if(!root?.ownerDocument||!panel)throw new TypeError('viewport classes require root and panel');
  if(!classes||typeof classes!=='object'||Array.isArray(classes))throw new TypeError('viewport classes must be an object');
  const slots=[];
  for(const [key,value] of Object.entries(classes)){
    if(!Object.hasOwn(SLOTS,key))throw new TypeError(`Unknown viewport class slot: ${key}`);
    const names=(Array.isArray(value)?value:[value]).flatMap(v=>typeof v==='string'?v.trim().split(/\s+/).filter(Boolean):[]);
    if(names.length)slots.push([SLOTS[key],[...new Set(names)]]);
  }
  const added=new Map();let observer,disposed=false;
  const sync=()=>{
    if(disposed)return;
    for(const [selector,names] of slots){
      const nodes=new Set();
      for(const node of [root,panel]){
        if(node.matches(selector))nodes.add(node);
        for(const child of node.querySelectorAll(selector))nodes.add(child);
      }
      for(const node of nodes)for(const name of names){
        if(node.classList.contains(name))continue;
        node.classList.add(name);if(!added.has(node))added.set(node,new Set());added.get(node).add(name);
      }
    }
  };
  sync();
  if(slots.length&&root.ownerDocument.defaultView?.MutationObserver){
    observer=new root.ownerDocument.defaultView.MutationObserver(sync);
    observer.observe(root,{childList:true,subtree:true});observer.observe(panel,{childList:true,subtree:true});
  }
  return {sync,dispose(){if(disposed)return;disposed=true;observer?.disconnect();for(const [node,names] of added)for(const name of names)node.classList.remove(name);added.clear();}};
}
