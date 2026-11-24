/**
 * Dependency-free basic orbit navigation for the built-in scope. Applications
 * with their own camera controls may use those instead; this never imports a
 * second Three.js copy. Left drag rotates, right drag pans, wheel/pinch zooms.
 */
export function createViewportOrbit(viewport,{target=null,onChange=()=>{},isEnabled=()=>true,minDistance=.05,maxDistance=1000,input=true}={}) {
  const {THREE,camera,canvas}=viewport??{};
  if(!THREE?.Vector3||!camera?.position||!canvas?.addEventListener)throw new TypeError('orbit requires a Three camera and canvas');
  const focus=target?.clone?.()??new THREE.Vector3();
  if(camera.position.distanceTo(focus)<1e-6)camera.position.set(0,0,4);
  const initialPosition=camera.position.clone(),initialTarget=focus.clone(),initialZoom=camera.zoom??1;
  const pointers=new Map(),abort=new AbortController(),signal=abort.signal;
  let enablePan=true;
  const size=()=>({width:Math.max(1,canvas.clientWidth||canvas.parentElement?.clientWidth||1),height:Math.max(1,canvas.clientHeight||canvas.parentElement?.clientHeight||1)});
  function changed(){camera.lookAt(focus);camera.updateProjectionMatrix?.();onChange();}
  function rotate(dx,dy){
    const offset=camera.position.clone().sub(focus),distance=Math.max(minDistance,offset.length()),s=size();
    let theta=Math.atan2(offset.x,offset.z)-2*Math.PI*dx/s.width;
    let phi=Math.acos(Math.max(-1,Math.min(1,offset.y/distance)))-Math.PI*dy/s.height;
    phi=Math.max(.001,Math.min(Math.PI-.001,phi));
    offset.set(distance*Math.sin(phi)*Math.sin(theta),distance*Math.cos(phi),distance*Math.sin(phi)*Math.cos(theta));
    camera.position.copy(focus).add(offset);changed();
  }
  function zoom(factor){
    factor=Math.max(.1,Math.min(10,factor));
    if(camera.isOrthographicCamera){camera.zoom=Math.max(.05,Math.min(100,(camera.zoom||1)/factor));}
    else {const offset=camera.position.clone().sub(focus),length=Math.max(minDistance,Math.min(maxDistance,offset.length()*factor));
      if(offset.lengthSq()<1e-12)offset.set(0,0,1);camera.position.copy(focus).add(offset.setLength(length));}
    changed();
  }
  function pan(dx,dy){
    if(!enablePan)return;
    const s=size(),distance=camera.position.distanceTo(focus);
    const worldHeight=camera.isOrthographicCamera?Math.abs(camera.top-camera.bottom)/(camera.zoom||1):2*distance*Math.tan((camera.fov||45)*Math.PI/360);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
    const delta=right.multiplyScalar(-dx*worldHeight/s.height).add(up.multiplyScalar(dy*worldHeight/s.height));
    focus.add(delta);camera.position.add(delta);changed();
  }
  const distance=()=>{const p=[...pointers.values()];return p.length<2?0:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);};
  if(input){
  canvas.addEventListener('pointerdown',event=>{
    if(!isEnabled()||(event.pointerType!=='touch'&&event.button!==0&&event.button!==2))return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,button:event.button});
    canvas.setPointerCapture?.(event.pointerId);event.preventDefault();
  },{signal});
  canvas.addEventListener('pointermove',event=>{
    if(!isEnabled()){pointers.clear();return;}
    const point=pointers.get(event.pointerId);if(!point)return;
    const oldDistance=distance(),dx=event.clientX-point.x,dy=event.clientY-point.y;
    point.x=event.clientX;point.y=event.clientY;
    if(pointers.size>=2){const next=distance();if(oldDistance>0&&next>0)zoom(oldDistance/next);}
    else if(point.button===2||event.shiftKey)pan(dx,dy);else rotate(dx,dy);
    event.preventDefault();
  },{signal});
  const release=event=>pointers.delete(event.pointerId);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,release,{signal});
  canvas.addEventListener('contextmenu',event=>{if(isEnabled())event.preventDefault();},{signal});
  canvas.addEventListener('wheel',event=>{if(!isEnabled())return;event.preventDefault();zoom(Math.exp(event.deltaY*.001));},{signal,passive:false});
  canvas.addEventListener('keydown',event=>{
    if(!isEnabled())return;
    switch(event.key){case 'ArrowLeft':rotate(-24,0);break;case 'ArrowRight':rotate(24,0);break;case 'ArrowUp':rotate(0,-24);break;case 'ArrowDown':rotate(0,24);break;
      case '+':case '=':zoom(.9);break;case '-':case '_':zoom(1.1);break;default:return;}event.preventDefault();
  },{signal});
  if(!canvas.hasAttribute?.('tabindex'))canvas.tabIndex=0;
  if(!canvas.hasAttribute?.('aria-label'))canvas.setAttribute?.('aria-label','Интерактивная 3D-сцена');
  }
  camera.lookAt(focus);
  return {target:focus,minDistance,maxDistance,rotate,pan,zoom,get enablePan(){return enablePan;},set enablePan(value){enablePan=!!value;},update:changed,reset(){focus.copy(initialTarget);camera.position.copy(initialPosition);camera.zoom=initialZoom;changed();},dispose(){abort.abort();pointers.clear();}};
}
