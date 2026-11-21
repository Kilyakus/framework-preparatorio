/** GTAO pipeline derived from Rephlexia. Three.js and its addons are supplied by the host. */
const AO_CURVE = 0.6;
const AO_DEAD = 0.03;
const AO_NEAR_M = 1.0;     // ближе — затенение прозрачнее
const AO_FAR_M = 10.0;     // дальше — в полную силу
const AO_BIAS_M = 0.03;
const AO_SAMPLES = 16;
const DOF_APERTURE_PER_M = 0.0005;
const DOF_MAXBLUR = 0.009;

function aoKernel(n) {
  const ker = [];
  for (let i = 0; i < n; i++) {
    const z = 0.08 + 0.92 * (i + 0.5) / n;                    // равномерно по площади полусферы
    const r = Math.sqrt(1 - z * z), ph = i * 2.39996323;
    const sc = 0.15 + 0.85 * ((i * 0.7548777 + 0.5698403) % 1); // равномерно по радиусу
    ker.push(`vec3(${(r * Math.cos(ph) * sc).toFixed(5)}, ${(r * Math.sin(ph) * sc).toFixed(5)}, ${(z * sc).toFixed(5)})`);
  }
  return ker;
}

function patchGtao(gtao, isExcluded) {
  // затенение = 1 − сила·доля^кривая (после сглаживания, в смешивании)
  const blend = gtao.blendMaterial;
  blend.uniforms.aoStr = { value: 0.5 };
  blend.uniforms.aoCurve = { value: AO_CURVE };
  blend.uniforms.aoDead = { value: AO_DEAD };
  // Маска «только карта»: глубина кадра (с персонажами) против глубины прохода
  // AO (без них). Кадр ближе карты больше допуска — пиксель не затеняется.
  blend.uniforms.tSceneDepth = { value: null };
  blend.uniforms.tMapDepth = { value: null };
  blend.uniforms.useMask = { value: 0 };
  blend.uniforms.cameraNear = { value: 1 };
  blend.uniforms.cameraFar = { value: 1000 };
  blend.uniforms.maskTol = { value: 0.15 };
  blend.fragmentShader = `#include <packing>
    uniform float intensity; uniform float aoStr; uniform float aoCurve; uniform float aoDead;
    uniform sampler2D tDiffuse; uniform highp sampler2D tSceneDepth; uniform highp sampler2D tMapDepth;
    uniform float useMask; uniform float cameraNear; uniform float cameraFar; uniform float maskTol;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float keep = 1.0;
      if (useMask > 0.5) {
        float sd = texture2D(tSceneDepth, vUv).r;
        float md = texture2D(tMapDepth, vUv).r;
        if (sd < 1.0) {
          float sz = -perspectiveDepthToViewZ(sd, cameraNear, cameraFar);
          float mz = md >= 1.0 ? 1e30 : -perspectiveDepthToViewZ(md, cameraNear, cameraFar);
          float tol = maskTol + sz * 0.01;
          keep = 1.0 - smoothstep(tol, tol * 2.0, mz - sz);
        }
      }
      float ao = pow(clamp((1.0 - texel.r - aoDead) / (1.0 - aoDead), 0.0, 1.0), aoCurve);
      gl_FragColor = vec4(vec3(clamp(1.0 - aoStr * intensity * keep * ao, 0.0, 1.0)), texel.a);
    }`;
  blend.needsUpdate = true;

  const m = gtao.gtaoMaterial;
  m.uniforms.aoNear = { value: AO_NEAR_M };
  m.uniforms.aoFar = { value: AO_FAR_M };
  m.uniforms.aoBias = { value: AO_BIAS_M };
  const ker = aoKernel(AO_SAMPLES);
  m.fragmentShader = `varying vec2 vUv;
    uniform highp sampler2D tNormal; uniform highp sampler2D tDepth; uniform sampler2D tNoise;
    uniform vec2 resolution; uniform float cameraNear; uniform float cameraFar;
    uniform mat4 cameraProjectionMatrix; uniform mat4 cameraProjectionMatrixInverse;
    uniform float radius; uniform float aoNear; uniform float aoFar; uniform float aoBias;
    #include <common>
    #include <packing>
    const vec3 KER[${AO_SAMPLES}] = vec3[${AO_SAMPLES}](${ker.join(',')});
    vec3 vpos(vec2 uv, float d) {
      vec4 c = cameraProjectionMatrixInverse * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
      return c.xyz / c.w;
    }
    void main() {
      float d = textureLod(tDepth, vUv, 0.0).r;
      if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
      vec3 P = vpos(vUv, d);
      vec3 n = unpackRGBToNormal(textureLod(tNormal, vUv, 0.0).rgb);
      vec2 nz = textureLod(tNoise, vUv * resolution / vec2(textureSize(tNoise, 0)), 0.0).xy * 2.0 - 1.0;
      vec3 rv = vec3(nz, 0.0);
      vec3 t = rv - n * dot(rv, n);
      if (dot(t, t) < 1e-4) { rv = vec3(-nz.y, 0.0, nz.x); t = rv - n * dot(rv, n); }
      t = normalize(t);
      mat3 TBN = mat3(t, cross(n, t), n);
      float bias = aoBias + 0.004 * -P.z;
      float occ = 0.0;
      for (int i = 0; i < ${AO_SAMPLES}; i++) {
        vec3 S = P + TBN * KER[i] * radius;
        vec4 c = cameraProjectionMatrix * vec4(S, 1.0);
        vec2 uv = c.xy / c.w * 0.5 + 0.5;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
        float sz = perspectiveDepthToViewZ(textureLod(tDepth, uv, 0.0).r, cameraNear, cameraFar);
        if (sz > S.z + bias) {
          float dz = sz - P.z;                                   // насколько заслоняющее ближе к камере
          occ += 1.0 - smoothstep(radius, radius * 1.8, dz);
        }
      }
      // доля заслонённой полусферы: 1 — у самого угла (там закрыта половина)
      float o = clamp(2.0 * occ / float(${AO_SAMPLES}), 0.0, 1.0) * smoothstep(aoNear, aoFar, -P.z);
      gl_FragColor = vec4(vec3(1.0 - o), 1.0);
    }`;
  m.needsUpdate = true;

  const pm = gtao.pdMaterial;
  pm.uniforms.pdSurface = { value: 0.05 };
  pm.fragmentShader = `varying vec2 vUv;
    uniform sampler2D tDiffuse; uniform sampler2D tNormal; uniform sampler2D tDepth;
    uniform vec2 resolution; uniform mat4 cameraProjectionMatrixInverse; uniform float pdSurface;
    #include <common>
    #include <packing>
    vec3 vpos(vec2 uv) {
      float d = textureLod(tDepth, uv, 0.0).r;
      vec4 c = cameraProjectionMatrixInverse * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
      return c.xyz / c.w;
    }
    void main() {
      float d0 = textureLod(tDepth, vUv, 0.0).r;
      if (d0 >= 1.0) { gl_FragColor = vec4(1.0); return; }
      vec3 p0 = vpos(vUv);
      vec3 n0 = unpackRGBToNormal(textureLod(tNormal, vUv, 0.0).rgb);
      vec2 px = 1.0 / resolution;
      float acc = 0.0, wsum = 0.0;
      for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
        vec2 uv = vUv + vec2(float(i), float(j)) * px;
        vec3 n = unpackRGBToNormal(textureLod(tNormal, uv, 0.0).rgb);
        vec3 p = vpos(uv);
        float dp = abs(dot(p - p0, n0)) / max(pdSurface, -p0.z * 0.02);
        float w = max(0.0, dot(n, n0)); w = w * w * w * w;
        w *= exp(-dp * dp);
        acc += textureLod(tDiffuse, uv, 0.0).r * w; wsum += w;
      }
      float ao = wsum > 1e-4 ? acc / wsum : textureLod(tDiffuse, vUv, 0.0).r;
      gl_FragColor = vec4(vec3(ao), 1.0);
    }`;
  pm.needsUpdate = true;

  // Прозрачное (стёкла, рентген, силуэт игрока за стеной), линии и точки
  // (скелет, гизмо) и персонажи в затенении не участвуют. Скрытый корень
  // персонажа прячет всю модель — его детей проход уже не рисует.
  gtao._overrideVisibility = function overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const mat = o.material;
      const hide = isExcluded(o)
        || o.isPoints || o.isLine || o.isLine2 || o.isSprite
        || (o.isMesh && mat && (Array.isArray(mat) ? mat.every((x) => x.transparent || !x.depthWrite) : (mat.transparent || !mat.depthWrite)));
      if (hide) { o.visible = false; cache.push(o); }
    });
  };
}


/** Mark an object root. Children inherit its category in the AO visibility pass.
 * Categories: character (player/NPC), dynamic, static, exclude (never participates).
 */
export function setViewportAoCategory(object,category) {
  if(!object?.userData) return object;
  if(category==null){delete object.userData.viewportAoCategory;return object;}
  if(!['character','dynamic','static','exclude'].includes(category)) throw new TypeError('Invalid AO category');
  object.userData.viewportAoCategory=category;return object;
}

export function createViewportAmbientOcclusion(viewport,{addons,classify=null,getUnitsPerMeter=()=>1,options={}}={}) {
  const {THREE,renderer,scene,camera}=viewport;
  const {EffectComposer,RenderPass,GTAOPass,OutputPass}=addons??{};
  if(!EffectComposer||!RenderPass||!GTAOPass||!OutputPass||!viewport.setRenderPipeline)
    throw new TypeError('AO requires host Three.js postprocessing addons and a viewport pipeline');
  let opts={ao:false,aoStrength:50,aoRadius:1.5,aoHalfRes:false,aoCharacters:false,aoDynamic:false,...options};
  let composer=null,gtao=null,disposed=false,width=1,height=1,ratio=1;
  function category(o){
    for(let node=o;node;node=node.parent){
      if(node.userData?.excludeFromAO)return 'exclude';
      const explicit=node.userData?.viewportAoCategory??classify?.(node);
      if(explicit)return explicit;
    }
    return o.isSkinnedMesh?'character':'static';
  }
  function excluded(o){const c=category(o);return c==='exclude'||c==='character'&&!opts.aoCharacters||c==='dynamic'&&!opts.aoDynamic;}
  function resize(){if(!composer)return;composer.setPixelRatio(ratio);composer.setSize(width,height);}
  function build(){
    if(composer)return;
    const depth=new THREE.DepthTexture(1,1);depth.format=THREE.DepthStencilFormat;depth.type=THREE.UnsignedInt248Type;
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:4,stencilBuffer:true,depthTexture:depth});
    try {
    composer=new EffectComposer(renderer,target);
    composer.addPass(new RenderPass(scene,camera));
    gtao=new GTAOPass(scene,camera,1,1);
    patchGtao(gtao,excluded);
    const render=gtao.render.bind(gtao);
    gtao.render=(r,write,read,dt,mask)=>{
      const u=gtao.blendMaterial.uniforms;
      u.tSceneDepth.value=read?.depthTexture||null;u.tMapDepth.value=gtao.depthTexture;
      u.useMask.value=u.tSceneDepth.value&&u.tMapDepth.value?1:0;
      u.cameraNear.value=camera.near;u.cameraFar.value=camera.far;
      const override=scene.overrideMaterial;
      try{return render(r,write,read,dt,mask);}finally{gtao._restoreVisibility?.();scene.overrideMaterial=override;}
    };
    const size=gtao.setSize.bind(gtao);
    gtao.setSize=(w,h)=>{const k=opts.aoHalfRes?.5:1;size(Math.max(1,Math.round(w*k)),Math.max(1,Math.round(h*k)));};
    composer.addPass(gtao);composer.addPass(new OutputPass());resize();
    } catch(error) {
      if(composer){if(gtao&&!composer.passes.includes(gtao))gtao.dispose?.();for(const pass of composer.passes)pass.dispose?.();composer.dispose();}
      else target.dispose();
      composer=null;gtao=null;throw error;
    }
  }
  function render(event){
    if(!opts.ao||event.scene!==scene||event.camera!==camera||!camera.isPerspectiveCamera){renderer.render(event.scene,event.camera);return;}
    build();
    const upm=Math.max(1e-6,Number(getUnitsPerMeter())||1);
    const u=gtao.gtaoMaterial.uniforms;
    u.radius.value=opts.aoRadius*upm;u.aoNear.value=AO_NEAR_M*upm;u.aoFar.value=AO_FAR_M*upm;u.aoBias.value=AO_BIAS_M*upm;
    gtao.pdMaterial.uniforms.pdSurface.value=.05*upm;
    gtao.blendMaterial.uniforms.maskTol.value=.15*upm;
    gtao.blendMaterial.uniforms.aoStr.value=opts.aoStrength/100;
    const nextRatio=renderer.getPixelRatio?.()||1;
    if(nextRatio!==ratio){ratio=nextRatio;resize();}
    composer.render();
  }
  const host=viewport.container??viewport.canvas;
  width=Math.max(1,host?.clientWidth||1);height=Math.max(1,host?.clientHeight||1);ratio=renderer.getPixelRatio?.()||1;
  const offPipeline=viewport.setRenderPipeline(render);
  const offResize=viewport.onResize?.(({width:w,height:h})=>{width=w;height=h;resize();})??(()=>{});
  let offDispose=()=>{};
  const api={
    set(next){if(disposed)throw new Error('AO disposed');const old=opts.aoHalfRes;opts={...opts,...next};if(old!==opts.aoHalfRes)resize();},
    get active(){return !!opts.ao&&!!camera.isPerspectiveCamera;},
    dispose(){if(disposed)return;disposed=true;offDispose();offPipeline();offResize();if(composer){for(const pass of composer.passes)pass.dispose?.();composer.dispose();composer=null;gtao=null;}},
  };
  offDispose=viewport.onDispose?.(()=>api.dispose())??(()=>{});return api;
}
