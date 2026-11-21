/** Accessible, independently controlled collapsible settings sections. */
let nextSectionId = 0;
export function mountViewportSection({host, key, label, sections, onSectionChange=()=>{}, className=''}={}) {
  if (!host?.ownerDocument || !key || !label) throw new TypeError('viewport section requires host, key and label');
  const doc=host.ownerDocument, section=doc.createElement('section');
  section.className=`v3d-section ${className}`.trim();
  section.dataset.v3dSection=key;
  const heading=doc.createElement('div');heading.className='v3d-section-heading';
  const toggle=doc.createElement('button');toggle.type='button';toggle.className='v3d-section-toggle';
  toggle.dataset.v3dSectionToggle=key;
  const arrow=doc.createElement('span');arrow.className='v3d-section-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent='▾';
  const title=doc.createElement('span');title.className='v3d-section-title';title.textContent=label;
  toggle.append(arrow,title);
  const actions=doc.createElement('div');actions.className='v3d-section-actions';
  heading.append(toggle,actions);
  const body=doc.createElement('div');body.className='v3d-section-body';body.id=`v3d-section-body-${++nextSectionId}`;
  body.dataset.v3dSectionBody=key;toggle.setAttribute('aria-controls',body.id);
  section.append(heading,body);host.append(section);
  const store=()=>typeof sections==='function'?sections():sections;
  let expanded=store()?.[`viewport3d-${key}`]!==false, disposed=false;
  function apply(){body.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));}
  function setExpanded(value,{persist=true}={}) {
    if(disposed)return;
    expanded=!!value;apply();
    if(persist){const saved=store();if(saved&&typeof saved==='object')saved[`viewport3d-${key}`]=expanded;onSectionChange(key,expanded);}
  }
  const handle=()=>setExpanded(!expanded);toggle.addEventListener('click',handle);apply();
  return {root:section,body,heading,toggle,actions,get expanded(){return expanded;},setExpanded,
    dispose(){if(disposed)return;disposed=true;toggle.removeEventListener('click',handle);section.remove();}};
}
