/** Shared editor camera policy. The host supplies the active character anchor
 * and notifies this controller of preview, selection and mode changes. */
export function createViewportCharacterFocus({camera, controls, getAnchor, element=null, isPreview=()=>false, isControlMode=()=>false, onChange=()=>{}}={}) {
  if(!camera?.position?.clone || !controls?.target?.clone || typeof getAnchor!=='function') throw new TypeError('character focus requires camera, controls and getAnchor');
  let disposed=false, originalPan=controls.enablePan, heightOffset=0, drag=null;
  const next=controls.target.clone(), delta=controls.target.clone();
  const locked=()=>!disposed&&!isPreview()&&isControlMode();
  function anchor(){
    const value=getAnchor(next);
    if(!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z))return false;
    if(value!==next)next.copy(value);
    next.y+=heightOffset;
    return true;
  }
  function center(){
    if(disposed||isPreview()||!anchor())return false;
    delta.copy(next).sub(controls.target);
    if(delta.lengthSq()<1e-12)return true;
    camera.position.add(delta);controls.target.copy(next);
    const damping=controls.enableDamping;controls.enableDamping=false;
    controls.update?.();controls.enableDamping=damping;onChange();return true;
  }
  function syncMode(){
    if(disposed)return;
    if('enablePan' in controls)controls.enablePan=locked()?false:originalPan;
    if(!locked())drag=null;
  }
  // Capture before OrbitControls (which listens in the bubble phase): locked
  // right-drag translates along world Y only, preserving the offset on follow.
  const abort=new AbortController();
  if(element?.addEventListener){
    const options={capture:true,signal:abort.signal};
    element.addEventListener('pointerdown',event=>{
      if(!locked()||controls.enabled===false||event.button!==2||event.pointerType==='touch')return;
      drag={id:event.pointerId,y:event.clientY};
      element.setPointerCapture?.(event.pointerId);event.preventDefault();event.stopImmediatePropagation();
    },options);
    element.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId||!locked())return;
      const dy=event.clientY-drag.y;drag.y=event.clientY;
      const height=Math.max(1,element.clientHeight||element.parentElement?.clientHeight||1);
      const distance=camera.position.distanceTo(controls.target);
      const worldHeight=camera.isOrthographicCamera?Math.abs(camera.top-camera.bottom)/(camera.zoom||1):2*distance*Math.tan((camera.fov||45)*Math.PI/360);
      heightOffset+=dy*worldHeight/height;
      center();event.preventDefault();event.stopImmediatePropagation();
    },options);
    const end=event=>{if(!drag||drag.id!==event.pointerId)return;drag=null;event.preventDefault();event.stopImmediatePropagation();};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,end,options);
    element.addEventListener('contextmenu',event=>{if(locked())event.preventDefault();},options);
  }
  return Object.freeze({
    center,
    selectionChanged(){heightOffset=0;if(!isPreview())center();syncMode();},
    previewChanged(){heightOffset=0;syncMode();if(!isPreview())center();},
    modeChanged(){syncMode();if(!isPreview()&&isControlMode())center();},
    update(){syncMode();if(!isPreview()&&isControlMode())center();},
    dispose(){if(disposed)return;disposed=true;drag=null;abort.abort();if('enablePan' in controls)controls.enablePan=originalPan;},
  });
}
