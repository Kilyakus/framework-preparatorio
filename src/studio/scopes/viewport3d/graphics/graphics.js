import {createViewportAmbientOcclusion} from './ambient-occlusion.js';
import {ViewportDynamicShadowQuality} from './shadow-quality.js';
/** Renderer settings shared by viewport3d hosts. Three.js is always injected. */
export const VIEWPORT3D_GRAPHICS_DEFAULTS = Object.freeze({
  exposure:1.08, toneMapping:'aces', colorSpace:'srgb',
  shadow:'auto', shadowType:'pcf', shadowAdjust:false, shadowBias:-0.00015,
  shadowNormalBias:0.005, shadowRadius:1,
  renderScale:1, maxPixelRatio:2, adaptiveResolution:false, adaptiveTarget:60,
  anisotropy:'source', cameraFov:45, cameraFar:0,
  ao:false, aoStrength:50, aoRadius:1.5, aoHalfRes:false, aoCharacters:false, aoDynamic:false,
});
const SHADOWS=['off','auto','512','1024','2048','4096','8192'];
const TONEMAPS={none:'NoToneMapping',linear:'LinearToneMapping',reinhard:'ReinhardToneMapping',cineon:'CineonToneMapping',aces:'ACESFilmicToneMapping',agx:'AgXToneMapping',neutral:'NeutralToneMapping'};
const SHADOW_TYPES={basic:'BasicShadowMap',pcf:'PCFShadowMap',soft:'PCFSoftShadowMap',vsm:'VSMShadowMap'};
const COLOR_SPACES={srgb:'SRGBColorSpace',linear:'LinearSRGBColorSpace'};
const number=(value,fallback,min,max)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;};
const oneOf=(value,values,fallback)=>values.includes(String(value))?String(value):fallback;

/** Invalid/old saved values are clamped; unrelated host state is not consumed. */
export function normalizeViewportGraphics(input={}, defaults=VIEWPORT3D_GRAPHICS_DEFAULTS) {
  input=input && typeof input==='object'?input:{};
  const d={...VIEWPORT3D_GRAPHICS_DEFAULTS,...defaults};
  return {
    exposure:number(input.exposure,d.exposure,.2,3),
    toneMapping:oneOf(input.toneMapping,Object.keys(TONEMAPS),d.toneMapping),
    colorSpace:oneOf(input.colorSpace,Object.keys(COLOR_SPACES),d.colorSpace),
    shadow:oneOf(input.shadow,SHADOWS,d.shadow),
    shadowType:oneOf(input.shadowType,Object.keys(SHADOW_TYPES),d.shadowType),
    shadowAdjust:typeof input.shadowAdjust==='boolean'?input.shadowAdjust:d.shadowAdjust,
    shadowBias:number(input.shadowBias,d.shadowBias,-.02,.02),
    shadowNormalBias:number(input.shadowNormalBias,d.shadowNormalBias,0,.1),
    shadowRadius:number(input.shadowRadius,d.shadowRadius,0,8),
    renderScale:number(input.renderScale,d.renderScale,.5,2),
    maxPixelRatio:number(input.maxPixelRatio,d.maxPixelRatio,.5,3),
    adaptiveResolution:typeof input.adaptiveResolution==='boolean'?input.adaptiveResolution:d.adaptiveResolution,
    adaptiveTarget:[30,45,60].includes(Number(input.adaptiveTarget))?Number(input.adaptiveTarget):d.adaptiveTarget,
    anisotropy:oneOf(input.anisotropy,['source','1','2','4','8','16'],d.anisotropy),
    cameraFov:number(input.cameraFov,d.cameraFov,15,100),
    cameraFar:number(input.cameraFar,d.cameraFar,0,1000000),
    ao:typeof input.ao==='boolean'?input.ao:d.ao,
    aoStrength:number(input.aoStrength,d.aoStrength,0,100),
    aoRadius:number(input.aoRadius,d.aoRadius,.1,10),
    aoHalfRes:typeof input.aoHalfRes==='boolean'?input.aoHalfRes:d.aoHalfRes,
    aoCharacters:typeof input.aoCharacters==='boolean'?input.aoCharacters:d.aoCharacters,
    aoDynamic:typeof input.aoDynamic==='boolean'?input.aoDynamic:d.aoDynamic,
  };
}

/** Stable render scale: ignore pauses and demand-rendered idle frames. */
export function createAdaptiveResolution({min=.6}={}) {
  let scale=1, good=0, seconds=0, frames=0;
  return {
    get scale(){return scale;},
    reset(){scale=1;good=0;seconds=0;frames=0;return scale;},
    pause(){good=0;seconds=0;frames=0;},
    sample(dt,target=60){
      if(!Number.isFinite(dt)||dt<=0||dt>.25){seconds=0;frames=0;good=0;return scale;}
      seconds+=dt;frames++;
      if(seconds<1)return scale;
      const fps=frames/seconds;seconds=0;frames=0;
      if(fps<target*.8){good=0;scale=Math.max(min,Math.round((scale-.1)*100)/100);}
      else if(fps>=target*.95){if(++good>=3){good=0;scale=Math.min(1,Math.round((scale+.05)*100)/100);}}
      else good=0;
      return scale;
    },
  };
}

const getGL=renderer=>{try{return renderer.getContext?.()??null;}catch{return null;}};
const getLimit=(gl,key)=>{try{return Number(gl?.getParameter?.(gl[key]))||Infinity;}catch{return Infinity;}};

/** The browser may redact the adapter. Never infer hardware from an empty name. */
export function viewportRendererInfo(renderer) {
  const gl=getGL(renderer);let name='',vendor='';
  try {
    const ext=gl?.getExtension?.('WEBGL_debug_renderer_info');
    if(ext){name=String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||'');vendor=String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)||'');}
  } catch {}
  const software=/swiftshader|llvmpipe|softpipe|software raster|software renderer|basic render|lavapipe/i.test(`${vendor} ${name}`);
  let contextLost=false;try{contextLost=!!gl?.isContextLost?.();}catch{}
  return {name:name||null,vendor:vendor||null,classification:software?'software':name?'reported':'unknown',
    context:gl?.constructor?.name??null,contextLost};
}

/** Conservative texture/renderbuffer ceiling; software renderers are capped. */
export function viewportHardwareLimits(renderer) {
  const gl=getGL(renderer),caps=renderer.capabilities??{};
  const maxTexture=Math.max(1,Number(caps.maxTextureSize)||getLimit(gl,'MAX_TEXTURE_SIZE')||4096);
  const maxBuffer=getLimit(gl,'MAX_RENDERBUFFER_SIZE');
  let shadowCeiling=Math.min(8192,maxTexture,maxBuffer);
  const rendererInfo=viewportRendererInfo(renderer),gpu=rendererInfo.name??'';
  if(rendererInfo.classification==='software')shadowCeiling=Math.min(shadowCeiling,2048);
  if((globalThis.navigator?.hardwareConcurrency??8)<=4||(globalThis.navigator?.deviceMemory??8)<=4)shadowCeiling=Math.min(shadowCeiling,4096);
  shadowCeiling=Math.max(1,2**Math.floor(Math.log2(Math.max(1,shadowCeiling))));
  const maxAnisotropy=Math.max(1,Number(caps.getMaxAnisotropy?.())||1);
  let attributes=null;try{attributes=gl?.getContextAttributes?.()??null;}catch{}
  return {maxTexture,maxBuffer,shadowCeiling,maxAnisotropy,gpu,rendererInfo,attributes};
}
function keyForConstant(THREE,table,value,fallback){return Object.keys(table).find(key=>THREE[table[key]]!==undefined&&THREE[table[key]]===value)??fallback;}
const collectMaterials=(scene,extra)=>{
  const materials=new Set();
  scene?.traverse?.(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)materials.add(material);});
  for(const material of extra?.()??[])if(material)materials.add(material);
  return materials;
};
/** Invalidate compiled shadow variants, including host-provided source materials. */
export function setViewportShadowMapEnabled(renderer,scene,enabled,{additionalMaterials=null}={}) {
  enabled=Boolean(enabled);
  if(!renderer?.shadowMap||renderer.shadowMap.enabled===enabled)return false;
  renderer.shadowMap.enabled=enabled;
  for(const material of collectMaterials(scene,additionalMaterials))material.needsUpdate=true;
  renderer.shadowMap.needsUpdate=true;
  return true;
}
const collectTextures=materials=>{
  const textures=new Set();
  const visit=value=>{if(value?.isTexture)textures.add(value);else if(Array.isArray(value))for(const item of value)visit(item);};
  for(const material of materials){for(const value of Object.values(material))visit(value);for(const uniform of Object.values(material.uniforms??{}))visit(uniform?.value);}
  return textures;
};
function collectShadowLights(scene){const lights=[];scene?.traverse?.(object=>{if(object.isLight&&object.castShadow&&object.shadow)lights.push(object);});return lights;}
function collectShadows(scene){return collectShadowLights(scene).map(light=>light.shadow);}
function setShadowSize(shadow,size){
  if(!shadow?.mapSize||shadow.mapSize.x===size&&shadow.mapSize.y===size)return;
  shadow.mapSize.set?.(size,size);shadow.map?.dispose?.();shadow.map=null;shadow.mapPass?.dispose?.();shadow.mapPass=null;shadow.needsUpdate=true;
}

/**
 * One controller per renderer. Hosts can adapt their own automatic shadow
 * controller, supply extra (temporarily off-scene) materials and persistence.
 * `refresh()` is called after a model/world/material replacement. It never owns
 * or disposes the host's scene assets. `dispose()` removes all hooks.
 */
export function createViewportGraphics(viewport,{settings={},defaults={},onChange=()=>{},invalidate=()=>{},canSample=()=>true,shadowAdapter=null,additionalMaterials=null,aoOptions=null}={}) {
  if(!viewport?.renderer||!viewport?.THREE)throw new TypeError('viewport graphics requires a viewport');
  const {renderer,THREE,scene,camera}=viewport, limits=viewportHardwareLimits(renderer);
  // The PCFSoft constant remains exported in r186+, but both Three renderers
  // have removed its implementation and silently switch to PCF while drawing.
  const revision=Number.parseInt(THREE.REVISION,10);
  const supported={
    toneMapping:Object.keys(TONEMAPS).filter(key=>THREE[TONEMAPS[key]]!==undefined),
    colorSpace:Object.keys(COLOR_SPACES).filter(key=>THREE[COLOR_SPACES[key]]!==undefined),
    shadowType:Object.keys(SHADOW_TYPES).filter(key=>THREE[SHADOW_TYPES[key]]!==undefined&&!(key==='soft'&&revision>=186)),
  };
  function normalizeSupported(input,fallback=VIEWPORT3D_GRAPHICS_DEFAULTS){
    const next=normalizeViewportGraphics(input,fallback);
    for(const key of Object.keys(supported))if(supported[key].length&&!supported[key].includes(next[key]))
      next[key]=supported[key].includes(fallback[key])?fallback[key]:supported[key][0];
    return next;
  }
  const actualDefaults={
    ...VIEWPORT3D_GRAPHICS_DEFAULTS,
    exposure:Number.isFinite(renderer.toneMappingExposure)?renderer.toneMappingExposure:1.08,
    toneMapping:keyForConstant(THREE,TONEMAPS,renderer.toneMapping,'aces'),
    colorSpace:keyForConstant(THREE,COLOR_SPACES,renderer.outputColorSpace,'srgb'),
    shadow:renderer.shadowMap?.enabled?'auto':'off',
    shadowType:keyForConstant(THREE,SHADOW_TYPES,renderer.shadowMap?.type,'pcf'),
    cameraFov:Number.isFinite(camera?.fov)?camera.fov:45,
    ...defaults,
  };
  const initialDefaults=normalizeSupported(actualDefaults);
  let value=normalizeSupported(settings,initialDefaults), disposed=false, shadows=[], lastQuality=null, lastFrame=0,lastScan=0;
  let effectiveRatio=Number(renderer.getPixelRatio?.())||1;
  const adaptive=createAdaptiveResolution(), shadowControllers=new Map(),originalTextures=new Map(),originalShadows=new Map(),listeners=new Set();
  let originalFar=null,lastAppliedFar=null;
  const aoCompatible=!!aoOptions&&[186,187].includes(revision)&&renderer.capabilities?.isWebGL2===true;
  const aoPipeline=aoCompatible?createViewportAmbientOcclusion(viewport,{...aoOptions,options:value}):null;
  const ceiling=()=>Math.min(limits.shadowCeiling,Number(shadowAdapter?.snapshot?.()?.ceiling)||Infinity);
  const currentRatio=()=>{
    const device=Math.max(.1,Number(globalThis.devicePixelRatio??globalThis.window?.devicePixelRatio)||1);
    const host=viewport.container??viewport.canvas, width=Math.max(1,host?.clientWidth||1),height=Math.max(1,host?.clientHeight||1);
    const maxBuffer=Math.min(limits.maxBuffer,limits.maxTexture);
    // A sane absolute DPR cap prevents extreme HiDPI/supersampling allocations.
    return Math.max(.1,Math.min(Math.min(3,device,value.maxPixelRatio)*value.renderScale*adaptive.scale,
      3,maxBuffer/width,maxBuffer/height));
  };
  function scale(){const next=currentRatio();if(Math.abs(next-effectiveRatio)<.001)return;effectiveRatio=next;renderer.setPixelRatio?.(next);invalidate();}
  function invalidateMaterials(){for(const material of collectMaterials(scene,additionalMaterials))material.needsUpdate=true;}
  function applyShadowAdjust(){
    for(const shadow of shadows){
      if(!originalShadows.has(shadow))originalShadows.set(shadow,{bias:shadow.bias,normalBias:shadow.normalBias,radius:shadow.radius});
      if(value.shadowAdjust){shadow.bias=value.shadowBias;shadow.normalBias=value.shadowNormalBias;shadow.radius=value.shadowRadius;shadow.needsUpdate=true;}
    }
  }
  function resetShadowAdjust(){
    if(shadowAdapter?.resetAdjust)shadowAdapter.resetAdjust();
    else for(const [shadow,original] of originalShadows)Object.assign(shadow,original,{needsUpdate:true});
  }
  function applyTextures(){
    const materials=collectMaterials(scene,additionalMaterials), textures=collectTextures(materials);
    for(const [texture,original] of originalTextures)if(!textures.has(texture)||value.anisotropy==='source'){
      if(texture.anisotropy!==original){texture.anisotropy=original;texture.needsUpdate=true;}
      originalTextures.delete(texture);
    }
    if(value.anisotropy==='source')return;
    const next=Math.min(Number(value.anisotropy),limits.maxAnisotropy);
    for(const texture of textures){if(!originalTextures.has(texture))originalTextures.set(texture,texture.anisotropy);
      if(texture.anisotropy!==next){texture.anisotropy=next;texture.needsUpdate=true;}}
  }
  function applyShadows({forceQuality=false}={}){
    const previous=shadows, lights=collectShadowLights(scene);shadows=lights.map(light=>light.shadow);
    for(const [shadow] of shadowControllers)if(!shadows.includes(shadow))shadowControllers.delete(shadow);
    for(const [shadow] of originalShadows)if(!shadows.includes(shadow))originalShadows.delete(shadow);
    const map=renderer.shadowMap;if(!map)return;
    const enabled=value.shadow!=='off';
    setViewportShadowMapEnabled(renderer,scene,enabled,{additionalMaterials});
    const desiredType=THREE[SHADOW_TYPES[value.shadowType]];
    if(desiredType!==undefined&&map.type!==desiredType){
      map.type=desiredType;
      for(const shadow of shadows){shadow.map?.dispose?.();shadow.map=null;shadow.mapPass?.dispose?.();shadow.mapPass=null;shadow.needsUpdate=true;}
      invalidateMaterials();map.needsUpdate=true;
    }
    if(enabled){
      if(shadowAdapter?.setQuality){
        shadowAdapter.setTarget?.(value.adaptiveTarget);
        if(forceQuality||lastQuality!==value.shadow){lastQuality=value.shadow;shadowAdapter.setQuality(value.shadow==='auto'?null:Math.min(Number(value.shadow),ceiling()));}
      } else {
        for(const shadow of shadows){
          let controller=shadowControllers.get(shadow);
          if(!controller){const light=lights.find(item=>item.shadow===shadow);const target=light?.target;const position=target?.position?.clone?.();const controls=target?.position?{get target(){return position&&target.getWorldPosition?target.getWorldPosition(position):target.position;}}:null;const maxSize=light?.isPointLight?Math.max(1,ceiling()/4):ceiling();controller=new ViewportDynamicShadowQuality({renderer,light,camera,controls,maxSize,minSize:Math.min(512,maxSize)});shadowControllers.set(shadow,controller);}
          controller.frameBudget=1000/value.adaptiveTarget;
          const desired=value.shadow==='auto'?null:Math.min(Number(value.shadow),controller.ceiling);
          if(forceQuality||controller.manual!==desired)controller.setQuality(desired);
        }
      }
      applyShadowAdjust();map.needsUpdate=true;
    }
    if(previous.length!==shadows.length)invalidate();
  }
  function applyAll({forceQuality=false}={}){
    if(THREE[TONEMAPS[value.toneMapping]]!==undefined&&renderer.toneMapping!==THREE[TONEMAPS[value.toneMapping]]){
      renderer.toneMapping=THREE[TONEMAPS[value.toneMapping]];invalidateMaterials();
    }
    renderer.toneMappingExposure=value.exposure;
    if(THREE[COLOR_SPACES[value.colorSpace]]!==undefined)renderer.outputColorSpace=THREE[COLOR_SPACES[value.colorSpace]];
    if(camera?.isPerspectiveCamera&&Number.isFinite(value.cameraFov)&&camera.fov!==value.cameraFov){camera.fov=value.cameraFov;camera.updateProjectionMatrix?.();}
    if(camera&&'far' in camera){
      if(value.cameraFar>0){if(originalFar===null||lastAppliedFar!==null&&camera.far!==lastAppliedFar)originalFar=camera.far;const far=Math.max(value.cameraFar,(Number(camera.near)||0)+.001);if(camera.far!==far){camera.far=far;camera.updateProjectionMatrix?.();}lastAppliedFar=far;}
      else if(originalFar!==null){if(camera.far===lastAppliedFar){camera.far=originalFar;camera.updateProjectionMatrix?.();}originalFar=null;lastAppliedFar=null;}
    }
    aoPipeline?.set(value);scale();applyShadows({forceQuality});applyTextures();invalidate();
  }
  const snapshot=()=>({settings:{...value}, effectivePixelRatio:effectiveRatio,adaptiveScale:adaptive.scale,limits:{...limits,shadowCeiling:ceiling(),shadowMin:Number(shadowAdapter?.minSize)||1},
    shadows:shadows.map(shadow=>({size:shadow.mapSize?.x??0,bias:shadow.bias,normalBias:shadow.normalBias,radius:shadow.radius})),
    shadowInfo:shadowAdapter?.snapshot?.()??shadowControllers.values().next().value?.snapshot()??null, effectiveCameraFar:camera?.far??null, aoSupported:!!aoPipeline&&!!camera?.isPerspectiveCamera, aoActive:!!aoPipeline?.active, perspective:!!camera?.isPerspectiveCamera,
    supportedToneMappings:[...supported.toneMapping],
    supportedShadowTypes:[...supported.shadowType],
    supportedColorSpaces:[...supported.colorSpace],
  });
  function publish(reason,save=false){const state=snapshot();for(const fn of [...listeners])fn(state,reason);if(save)onChange({...value},reason);}
  function set(patch,{persist=true}={}){
    if(disposed)throw new Error('viewport graphics disposed');
    const next=normalizeSupported({...value,...patch},value);
    if(Object.keys(next).every(key=>Object.is(next[key],value[key])))return false;
    const was=value;value=next;
    if(was.shadowAdjust&&!value.shadowAdjust)resetShadowAdjust();
    if(was.adaptiveResolution!==value.adaptiveResolution||was.renderScale!==value.renderScale||was.maxPixelRatio!==value.maxPixelRatio||was.adaptiveTarget!==value.adaptiveTarget){adaptive.reset();lastFrame=0;}
    applyAll();publish('change',persist);return true;
  }
  function refresh(){if(disposed)return;applyAll();publish('refresh');}
  const offResize=viewport.onResize?.(()=>{scale();publish('resize');})??(()=>{});
  const offBefore=viewport.onRender?.(()=>{
    // Preserve a host's new clip distance when switching worlds while overriding it.
    if(value.cameraFar>0&&camera&&camera.far!==lastAppliedFar){originalFar=camera.far;lastAppliedFar=Math.max(value.cameraFar,(Number(camera.near)||0)+.001);camera.far=lastAppliedFar;camera.updateProjectionMatrix?.();}
    // Host auto-quality controllers can refresh bias when a world or map changes.
    if(value.shadowAdjust)applyShadowAdjust();
  },{phase:'before'})??(()=>{});
  const offAfter=viewport.onRender?.(()=>{
    const now=globalThis.performance?.now?.()??Date.now();
    if((value.adaptiveResolution||(value.shadow==='auto'&&!shadowAdapter?.setQuality))&&!globalThis.document?.hidden&&canSample()){
      if(lastFrame){const dt=(now-lastFrame)/1000;
        if(value.adaptiveResolution){const before=adaptive.scale,after=adaptive.sample(dt,value.adaptiveTarget);if(after!==before){scale();publish('adaptive');}}
        if(value.shadow==='auto'&&!shadowAdapter?.setQuality){let changed=false;for(const controller of shadowControllers.values()){controller.frameBudget=1000/value.adaptiveTarget;const before=controller.size;controller.update(dt);changed||=before!==controller.size;}if(changed){invalidate();publish('adaptive');}}
      }
      lastFrame=now;
    } else {lastFrame=0;adaptive.pause();for(const controller of shadowControllers.values())controller.update(0);}
    // Detect newly attached/replaced lights and opt-in texture overrides without
    // traversing a large scene every frame. Idle demand-renderers do not spin.
    if(now-lastScan>2000){
      lastScan=now;const next=collectShadows(scene);
      if(next.length!==shadows.length||next.some((shadow,index)=>shadow!==shadows[index])){applyShadows();publish('refresh');}
      if(value.anisotropy!=='source')applyTextures();
    }
  })??(()=>{});
  try {applyAll({forceQuality:true});}catch(error){offResize();offBefore();offAfter();aoPipeline?.dispose();throw error;}
  let offDispose=()=>{};
  const api=Object.freeze({
    get value(){return {...value};}, get defaults(){return {...initialDefaults};}, snapshot, set, refresh,
    reset(){return set(initialDefaults);},
    subscribe(fn,{immediate=true}={}){if(disposed)throw new Error('viewport graphics disposed');listeners.add(fn);if(immediate)fn(snapshot(),'init');return()=>listeners.delete(fn);},
    dispose(){if(disposed)return;disposed=true;offDispose();offResize();offBefore();offAfter();aoPipeline?.dispose();
      for(const [texture,original] of originalTextures)if(texture.anisotropy!==original){texture.anisotropy=original;texture.needsUpdate=true;}
      if(originalFar!==null&&camera){if(camera.far===lastAppliedFar){camera.far=originalFar;camera.updateProjectionMatrix?.();}originalFar=null;}
      shadowControllers.clear();originalTextures.clear();originalShadows.clear();listeners.clear();},
  });
  offDispose=viewport.onDispose?.(()=>api.dispose())??(()=>{});
  return api;
}
