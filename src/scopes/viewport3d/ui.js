import {createViewportModes,mountViewportModes} from './modes.js';
import {createViewportGraphics} from './graphics.js';

/** Shared, composable chrome. Host-specific scene and commands occupy their own slots. */
export const VIEWPORT3D_HEADER_TEMPLATE = `<header class="v3d-header"><span class="v3d-title">3D Просмотр</span><div class="v3d-mode-host" data-v3d-mode-host></div><span class="v3d-spacer"></span><div class="v3d-graphics-menu"><button class="v3d-graphics-toggle" type="button" data-v3d-graphics-toggle aria-label="Настройки графики" aria-expanded="false" aria-haspopup="true" title="Графика">⚙ <span>Графика</span></button><div class="v3d-graphics-pop" data-v3d-graphics-panel hidden></div></div></header>`;
export const VIEWPORT3D_TOOLS_TEMPLATE = `<div class="v3d-tools" data-v3d-tool-host></div>`;
export const VIEWPORT3D_TEMPLATE = `<section class="v3d-scope" data-viewport3d-scope aria-label="3D Просмотр">${VIEWPORT3D_HEADER_TEMPLATE}<div class="v3d-stage"><div class="v3d-container" data-viewport3d-container></div>${VIEWPORT3D_TOOLS_TEMPLATE}</div></section>`;

const GRAPHICS_TEMPLATE = `<div class="v3d-graphics" data-v3d-graphics>
  <div class="v3d-graphics-heading"><strong>Графика</strong><button type="button" data-v3d-reset title="Восстановить настройки графики">Сбросить</button></div>
  <details open><summary>Кадр и производительность</summary>
    <label class="v3d-range"><span>Масштаб разрешения</span><output data-v3d-output="renderScale"></output><input data-v3d-setting="renderScale" type="range" min="0.5" max="2" step="0.05"></label>
    <label class="v3d-range"><span>Предел плотности экрана</span><output data-v3d-output="maxPixelRatio"></output><input data-v3d-setting="maxPixelRatio" type="range" min="0.5" max="3" step="0.1"></label>
    <p class="v3d-info" data-v3d-resolution-info></p>
    <label class="v3d-check"><input data-v3d-setting="adaptiveResolution" type="checkbox"> Адаптивное разрешение</label>
    <label class="v3d-field"><span>Целевая частота</span><select data-v3d-setting="adaptiveTarget"><option value="30">30 FPS</option><option value="45">45 FPS</option><option value="60">60 FPS</option></select></label>
    <p class="v3d-info">Под нагрузкой масштаб снижается и постепенно восстанавливается. На паузах и в скрытой вкладке замеры не учитываются.</p>
    <p class="v3d-info" data-v3d-context-info></p>
  </details>
  <details open><summary>Цвет и тон</summary>
    <label class="v3d-range"><span>Экспозиция</span><output data-v3d-output="exposure"></output><input data-v3d-setting="exposure" type="range" min="0.2" max="3" step="0.01"></label>
    <label class="v3d-field"><span>Тональное отображение</span><select data-v3d-setting="toneMapping"><option value="none">Без тональной компрессии</option><option value="linear">Линейное</option><option value="reinhard">Reinhard</option><option value="cineon">Cineon</option><option value="aces">ACES Filmic</option><option value="agx">AgX</option><option value="neutral">Neutral</option></select></label>
    <label class="v3d-field"><span>Цветовое пространство вывода</span><select data-v3d-setting="colorSpace"><option value="srgb">sRGB</option><option value="linear">Линейное sRGB</option></select></label>
    <p class="v3d-info">Без тонального отображения экспозиция может не влиять на материалы. Линейный вывод предназначен для специальных рабочих процессов.</p>
  </details>
  <details open><summary>Тени</summary>
    <label class="v3d-field"><span>Качество теней</span><select data-v3d-setting="shadow"><option value="auto">Автоматически</option><option value="off">Отключены</option><option value="512">Очень низкое · 512²</option><option value="1024">Низкое · 1024²</option><option value="2048">Среднее · 2048²</option><option value="4096">Высокое · 4096²</option><option value="8192">Ультра · 8192²</option></select></label>
    <p class="v3d-info" data-v3d-shadow-info></p>
    <label class="v3d-field"><span>Фильтр теней</span><select data-v3d-setting="shadowType"><option value="basic">Жёсткий</option><option value="pcf">PCF</option><option value="soft">Мягкий PCF</option><option value="vsm">VSM</option></select></label>
    <p class="v3d-info" data-v3d-shadow-type-info></p>
    <label class="v3d-check"><input data-v3d-setting="shadowAdjust" type="checkbox"> Ручная коррекция теней</label>
    <label class="v3d-range"><span>Смещение глубины</span><output data-v3d-output="shadowBias"></output><input data-v3d-setting="shadowBias" type="range" min="-0.01" max="0.01" step="0.00005"></label>
    <label class="v3d-range"><span>Смещение по нормали</span><output data-v3d-output="shadowNormalBias"></output><input data-v3d-setting="shadowNormalBias" type="range" min="0" max="0.1" step="0.0005"></label>
    <label class="v3d-range"><span>Радиус фильтра</span><output data-v3d-output="shadowRadius"></output><input data-v3d-setting="shadowRadius" type="range" min="0" max="8" step="0.1"></label>
    <p class="v3d-info">Радиус зависит от выбранного фильтра; мягкий PCF в Three.js не использует этот параметр. Лимит устройства может уменьшить выбранный размер.</p>
  </details>
  <details><summary>Текстуры и камера</summary>
    <label class="v3d-field"><span>Анизотропная фильтрация</span><select data-v3d-setting="anisotropy"><option value="source">Как в материале</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option><option value="16">16×</option></select></label>
    <p class="v3d-info" data-v3d-texture-info></p>
    <label class="v3d-range"><span>Угол обзора камеры</span><output data-v3d-output="cameraFov"></output><input data-v3d-setting="cameraFov" type="range" min="15" max="100" step="1"></label>
    <p class="v3d-info" data-v3d-camera-info></p>
  </details>
</div>`;
const ranges={renderScale:v=>`${Math.round(v*100)}%`,maxPixelRatio:v=>`${v.toFixed(1)}×`,exposure:v=>v.toFixed(2),shadowBias:v=>v.toFixed(5),shadowNormalBias:v=>v.toFixed(4),shadowRadius:v=>v.toFixed(1),cameraFov:v=>`${Math.round(v)}°`};

/** Render the same real controls in a popup or any host-specific settings slot. */
export function mountViewportGraphics({host,graphics,legacyIds=false}={}) {
  if(!host?.ownerDocument||!graphics)throw new TypeError('viewport graphics slot and controller are required');
  const doc=host.ownerDocument, wrapper=doc.createElement('div');wrapper.innerHTML=GRAPHICS_TEMPLATE;
  const root=wrapper.firstElementChild;host.append(root);
  const abort=new AbortController(),signal=abort.signal,inputs=[...root.querySelectorAll('[data-v3d-setting]')];
  const inputFor=name=>root.querySelector(`[data-v3d-setting="${name}"]`);
  if(legacyIds){
    for(const [key,id] of Object.entries({shadow:'displayShadow',exposure:'displayExposure',adaptiveResolution:'displayAdaptive'}))inputFor(key).id=id;
    root.querySelector('[data-v3d-shadow-info]').id='displayShadowInfo';root.querySelector('[data-v3d-output="exposure"]').id='displayExposureValue';
  }
  function sync(state){
    const v=state.settings;
    for(const input of inputs){const key=input.dataset.v3dSetting;if(input.type==='checkbox')input.checked=!!v[key];else input.value=String(v[key]);
      const output=root.querySelector(`[data-v3d-output="${key}"]`);if(output)output.value=output.textContent=ranges[key]?.(v[key])??String(v[key]);}
    for(const [name,supported] of [['toneMapping',state.supportedToneMappings],['shadowType',state.supportedShadowTypes],['colorSpace',state.supportedColorSpaces]])
      for(const option of inputFor(name).options)option.disabled=!supported.includes(option.value);
    inputFor('adaptiveTarget').disabled=!v.adaptiveResolution;
    const hasShadow=state.shadows.length>0;
    inputFor('shadow').disabled=!hasShadow;
    for(const option of inputFor('shadow').options)option.disabled=/^\d+$/.test(option.value)&&Number(option.value)<state.limits.shadowMin;
    inputFor('shadowType').disabled=!hasShadow||v.shadow==='off';
    root.querySelector('[data-v3d-shadow-type-info]').textContent=state.supportedShadowTypes.includes('soft')?'':'Мягкий PCF недоступен в этой версии Three.js; используйте PCF.';
    inputFor('shadowAdjust').disabled=!hasShadow||v.shadow==='off';
    for(const key of ['shadowBias','shadowNormalBias','shadowRadius'])inputFor(key).disabled=!hasShadow||v.shadow==='off'||!v.shadowAdjust||(key==='shadowRadius'&&v.shadowType==='soft');
    inputFor('cameraFov').disabled=!state.perspective;
    root.querySelector('[data-v3d-resolution-info]').textContent=`Фактическая плотность: ${state.effectivePixelRatio.toFixed(2)}×${v.adaptiveResolution?` · адаптация ${Math.round(state.adaptiveScale*100)}%`:''}.`;
    const attrs=state.limits.attributes;
    root.querySelector('[data-v3d-context-info]').textContent=attrs?`Сглаживание MSAA: ${attrs.antialias?'включено':'выключено'} · буфер глубины: ${attrs.depth?'есть':'нет'}. Параметры WebGL-контекста задаются при создании окна.`:'Сглаживание и параметры WebGL-контекста задаются при создании окна.';
    const actual=state.shadowInfo?.size??state.shadows[0]?.size;
    root.querySelector('[data-v3d-shadow-info]').textContent=!hasShadow?'В сцене нет источника, отбрасывающего тени.':v.shadow==='off'?'Тени отключены':`Фактически: ${actual||'—'}² · предел устройства ${state.limits.shadowCeiling}²${v.shadow!=='auto'&&Number(v.shadow)>state.limits.shadowCeiling?' · ограничено устройством':''}.`;
    root.querySelector('[data-v3d-texture-info]').textContent=`Предел устройства: ${state.limits.maxAnisotropy}×. Переопределяются текстуры текущих материалов; исходные значения можно восстановить.`;
    root.querySelector('[data-v3d-camera-info]').textContent=state.perspective?'Применяется к перспективной камере.':'В ортографическом виде угол обзора не используется.';
  }
  for(const input of inputs){
    const event=input.type==='range'?'input':'change';
    input.addEventListener(event,()=>{
      const value=input.type==='checkbox'?input.checked:input.type==='range'||input.dataset.v3dSetting==='adaptiveTarget'?Number(input.value):input.value;
      graphics.set({[input.dataset.v3dSetting]:value});
    },{signal});
  }
  root.querySelector('[data-v3d-reset]').addEventListener('click',()=>graphics.reset(),{signal});
  const off=graphics.subscribe(sync);
  return {root,dispose(){off();abort.abort();root.remove();}};
}

/** Wire common slots. Hosts can provide existing mode/graphics controllers. */
export function mountViewportChrome({root,viewport,modeOptions={},graphicsOptions={},modes=null,graphics=null}={}) {
  if(!root?.querySelector||!viewport)throw new TypeError('viewport chrome requires root and viewport');
  const modeHost=root.querySelector('[data-v3d-mode-host]'),toolHost=root.querySelector('[data-v3d-tool-host]');
  const panel=root.querySelector('[data-v3d-graphics-panel]'),toggle=root.querySelector('[data-v3d-graphics-toggle]');
  if(!modeHost||!toolHost||!panel||!toggle)throw new Error('viewport chrome slots are missing');
  const ownModes=!modes, ownGraphics=!graphics;
  modes ||= createViewportModes(modeOptions);graphics ||= createViewportGraphics(viewport,graphicsOptions);
  let modeUI,graphicsUI,observer,disposed=false,offDispose=()=>{};
  const abort=new AbortController(),signal=abort.signal;
  const document=root.ownerDocument,originalParent=panel.parentNode,originalNext=panel.nextSibling,originalStyle=panel.getAttribute('style');
  const restorePanel=()=>{
    panel.hidden=true;toggle.setAttribute('aria-expanded','false');
    if(originalStyle===null)panel.removeAttribute('style');else panel.setAttribute('style',originalStyle);
    if(originalParent)originalParent.insertBefore(panel,originalNext?.parentNode===originalParent?originalNext:null);
  };
  try{
    modeUI=mountViewportModes({modes,modeHost,toolHost});graphicsUI=mountViewportGraphics({host:panel,graphics});
    // Dock panels commonly clip descendants. Portal the popup to the document
    // so every control remains reachable even in a small or resized viewport.
    document.body.append(panel);
    const close=()=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');};
    const position=()=>{
      if(panel.hidden)return;
      const win=document.defaultView,anchor=toggle.getBoundingClientRect(),margin=8,gap=5;
      if(!toggle.isConnected||!toggle.getClientRects().length||anchor.bottom<=0||anchor.top>=win.innerHeight||anchor.right<=0||anchor.left>=win.innerWidth){close();return;}
      const width=Math.max(1,Math.min(320,win.innerWidth-margin*2));
      panel.style.position='fixed';panel.style.width=`${width}px`;panel.style.right='auto';
      const below=Math.max(0,win.innerHeight-anchor.bottom-margin-gap),above=Math.max(0,anchor.top-margin-gap);
      const desired=Math.max(1,Math.min(650,panel.scrollHeight,win.innerHeight-margin*2));
      const placeBelow=below>=Math.min(desired,240)||below>=above;
      const height=Math.max(1,Math.min(desired,(placeBelow?below:above)||win.innerHeight-margin*2));
      panel.style.maxHeight=`${height}px`;
      panel.style.left=`${Math.max(margin,Math.min(anchor.right-width,win.innerWidth-width-margin))}px`;
      const top=placeBelow?anchor.bottom+gap:anchor.top-gap-height;
      panel.style.top=`${Math.max(margin,Math.min(top,win.innerHeight-height-margin))}px`;
    };
    toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));position();},{signal});
    document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!toggle.contains(event.target))close();},{signal});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){close();toggle.focus();}},{signal});
    document.defaultView?.addEventListener('resize',position,{signal});
    document.addEventListener('scroll',position,{capture:true,signal});
    if(globalThis.ResizeObserver){observer=new ResizeObserver(position);observer.observe(toggle);observer.observe(root);}
    offDispose=viewport.onDispose?.(dispose)??(()=>{});
  }catch(error){abort.abort();observer?.disconnect();restorePanel();modeUI?.dispose();graphicsUI?.dispose();if(ownModes)modes.dispose();if(ownGraphics)graphics.dispose();throw error;}
  function dispose(){
    if(disposed)return;disposed=true;offDispose();abort.abort();observer?.disconnect();restorePanel();
    modeUI.dispose();graphicsUI.dispose();if(ownModes)modes.dispose();if(ownGraphics)graphics.dispose();
  }
  return {modes,graphics,dispose};
}
