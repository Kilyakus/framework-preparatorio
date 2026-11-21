/** Camera commands shared by the built-in viewport chrome. Three is host-injected. */
export const VIEWPORT3D_VIEW_DIRECTIONS = Object.freeze({
  front:[0,0,1],back:[0,0,-1],right:[1,0,0],left:[-1,0,0],
  top:[0,1,.0001],bottom:[0,-1,.0001],persp:[.42,.22,1],
});

export function mountViewportNavigation({root,viewport,orbit,invalidate=()=>{},isEnabled=()=>true,fitObject}={}) {
  if(!root || !viewport || !orbit) throw new TypeError('navigation requires root, viewport and orbit');
  const {camera,THREE,scene}=viewport,doc=root.ownerDocument;
  const select=name=>root.querySelector(`[data-v3d-${name}]`);
  const output=select('zoom-reset'),stage=select('stage');
  const abort=new AbortController(),signal=abort.signal;
  let disposed=false,baseDistance=camera.position.distanceTo(orbit.target)||1,baseZoom=camera.zoom||1;
  const sync=()=>{if(output){const ratio=camera.isOrthographicCamera?(camera.zoom||1)/baseZoom:baseDistance/Math.max(.001,camera.position.distanceTo(orbit.target));output.textContent=`${Math.round(ratio*100)}%`;}};
  const changed=()=>{camera.lookAt(orbit.target);camera.updateProjectionMatrix?.();sync();invalidate();};
  const zoom=factor=>{if(!isEnabled())return;orbit.zoom(factor);sync();invalidate();};
  const setView=view=>{
    if(!isEnabled()||!VIEWPORT3D_VIEW_DIRECTIONS[view])return;
    const distance=camera.position.distanceTo(orbit.target)||baseDistance;
    const dir=new THREE.Vector3(...VIEWPORT3D_VIEW_DIRECTIONS[view]).normalize();
    camera.position.copy(orbit.target).addScaledVector(dir,distance);camera.up.set(0,1,0);changed();
  };
  const resetBase=()=>{baseDistance=camera.position.distanceTo(orbit.target)||baseDistance;baseZoom=camera.zoom||1;sync();};
  const fit=()=>{
    if(!isEnabled())return false;
    // Ignore the infinite built-in grid, helpers and invisible branches. Hosts
    // can supply an explicit model root when their scene contains other meshes.
    const box=new THREE.Box3(),part=new THREE.Box3();box.makeEmpty();
    const visit=obj=>{
      if(!obj || obj.visible===false || obj.userData?.baseMap || obj.userData?.viewport3dExcludeFromFit || obj.isHelper)return;
      if((obj.isMesh||obj.isPoints||obj.isLine) && obj.geometry){
        obj.updateWorldMatrix?.(true,false);
        if (obj.isSkinnedMesh || obj.isInstancedMesh) obj.computeBoundingBox?.();
        else if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox?.();
        const local=obj.boundingBox ?? obj.geometry.boundingBox;
        if(local){part.copy(local).applyMatrix4(obj.matrixWorld);if(!part.isEmpty())box.union(part);}
      }
      for(const child of obj.children??[])visit(child);
    };
    visit(typeof fitObject==='function'?fitObject():fitObject??scene);
    if(box.isEmpty())return false;
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    if(!Number.isFinite(size.x+size.y+size.z))return false;
    let direction=camera.position.clone().sub(orbit.target);
    if(direction.lengthSq()<1e-10)direction.set(.42,.22,1);
    direction.normalize();orbit.target.copy(center);
    if(camera.isOrthographicCamera){
      const radius=Math.max(size.length()/2,.01),width=Math.abs(camera.right-camera.left),height=Math.abs(camera.top-camera.bottom);
      camera.zoom=Math.max(.05,Math.min(100,Math.min(width,height)/(radius*2.4)));
    } else {
      const radius=Math.max(size.length()/2,.01),vertical=(camera.fov||45)*Math.PI/180;
      const horizontal=2*Math.atan(Math.tan(vertical/2)*(camera.aspect||1));
      const distance=radius/Math.sin(Math.min(vertical,horizontal)/2)*1.2;
      camera.position.copy(center).addScaledVector(direction,Math.max(orbit.minDistance??.05,Math.min(orbit.maxDistance??1000,distance)));
    }
    if(camera.isOrthographicCamera)camera.position.copy(center).addScaledVector(direction,baseDistance);
    changed();resetBase();return true;
  };
  select('zoom-in')?.addEventListener('click',()=>zoom(1/1.15),{signal});
  select('zoom-out')?.addEventListener('click',()=>zoom(1.15),{signal});
  output?.addEventListener('click',()=>{
    if(!isEnabled())return;
    if(camera.isOrthographicCamera){camera.zoom=baseZoom;changed();}
    else {
      const direction=camera.position.clone().sub(orbit.target);
      if(direction.lengthSq()<1e-10)direction.set(0,0,1);
      camera.position.copy(orbit.target).add(direction.setLength(Math.max(orbit.minDistance??.05,Math.min(orbit.maxDistance??1000,baseDistance))));
      changed();
    }
  },{signal});
  select('fit')?.addEventListener('click',fit,{signal});
  select('fullscreen')?.addEventListener('click',()=>{
    if(!isEnabled()||!stage)return;
    const action=doc.fullscreenElement===stage?doc.exitFullscreen?.():!doc.fullscreenElement?stage.requestFullscreen?.():null;
    action?.catch?.(error=>console.warn('viewport3d fullscreen:',error));
  },{signal});
  // Keyboard shortcuts are scoped to the active viewport so instances do not
  // compete with one another or with text controls elsewhere in the editor.
  root.addEventListener('keydown',event=>{
    if(!isEnabled()||event.defaultPrevented||event.target.closest?.('input, textarea, select, [role=combobox], [contenteditable=true]')||event.altKey||event.metaKey)return;
    const direct={Numpad1:'front',Numpad3:'right',Numpad7:'top'},reverse={Numpad1:'back',Numpad3:'left',Numpad7:'bottom'};
    const view=(event.ctrlKey?reverse:direct)[event.code]||(!event.ctrlKey&&event.code==='Numpad5'?'persp':null);
    if(view){event.preventDefault();setView(view);}else if(!event.ctrlKey&&event.code==='Home'){event.preventDefault();fit();}
  },{signal});
  const off=viewport.onRender?.(sync)??(()=>{});
  sync();
  return {setView,fit,zoom,resetBase,sync,dispose(){if(disposed)return;disposed=true;abort.abort();off();}};
}
