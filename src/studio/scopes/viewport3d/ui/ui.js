import {createViewportModes,mountViewportModes} from './modes.js';
import {createViewportGraphics} from '../graphics/graphics.js';
import {mountViewportSection} from './sections.js';
import {createViewportDisplay,mountViewportDisplay,contributeStudioGrid} from './display.js';
import {createViewportEnvironments,mountViewportEnvironment} from '../environment/environments.js';
import {mountViewportContributions} from './contributions.js';
import {mountViewportClasses} from './classes.js';

/** Shared, composable chrome. Host-specific scene and commands occupy their own slots. */
export const VIEWPORT3D_HEADER_TEMPLATE = `<header class="v3d-header"><div class="v3d-mode-host" data-v3d-mode-host></div><div class="v3d-navigation" role="group" aria-label="Управление камерой"><button type="button" data-v3d-zoom-out aria-label="Отдалить" title="Отдалить">−</button><button type="button" data-v3d-zoom-reset aria-label="Восстановить масштаб" title="Восстановить масштаб">100%</button><button type="button" data-v3d-zoom-in aria-label="Приблизить" title="Приблизить">+</button><button type="button" data-v3d-fit aria-label="Вписать сцену" title="Вписать сцену"><svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.6"/><path d="M8 1.5v2 M8 12.5v2 M1.5 8h2 M12.5 8h2"/></svg></button><button type="button" data-v3d-fullscreen aria-label="Полный экран" title="Полный экран"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg></button></div><span class="v3d-spacer"></span><div class="v3d-graphics-menu"><button class="v3d-graphics-toggle" type="button" data-v3d-graphics-toggle aria-label="Дополнительные настройки просмотра" aria-expanded="false" aria-haspopup="true" title="Окружение и дополнительные настройки"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m8 1.8 6 3.1-6 3.1-6-3.1 6-3.1Z M2 7.8l6 3.1 6-3.1 M2 10.7l6 3.1 6-3.1"/></svg></button><div class="v3d-graphics-pop" data-v3d-graphics-panel hidden></div></div></header>`;
export const VIEWPORT3D_TOOLS_TEMPLATE = `<div class="v3d-tools" data-v3d-tool-host></div>`;
export const VIEWPORT3D_TEMPLATE = `<section class="v3d-scope" data-viewport3d-scope aria-label="3D Просмотр">${VIEWPORT3D_HEADER_TEMPLATE}<div class="v3d-stage" data-v3d-stage><div class="v3d-container" data-viewport3d-container></div>${VIEWPORT3D_TOOLS_TEMPLATE}<div class="b-nav-gizmo" data-v3d-gizmo aria-label="Ориентация сцены" title="Роза осей: клик по оси ставит ракурс, центр — перспектива"><button type="button" class="b-gizmo-center" data-gizmo-center aria-label="Перспектива" title="Перспектива"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 2.6 13.4 5.6 8 8.6 2.6 5.6 8 2.6Z M2.6 5.6v4.8L8 13.4l5.4-3V5.6"/></svg></button></div></div></section>`;

const GRAPHICS_TEMPLATE = `<div class="v3d-graphics" data-v3d-graphics>
  <details open><summary>Кадр и производительность</summary>
    <label class="range-row"><span>Масштаб разрешения</span><output data-v3d-output="renderScale"></output><input data-v3d-setting="renderScale" type="range" min="0.5" max="2" step="0.05"></label>
    <label class="range-row"><span>Предел плотности экрана</span><output data-v3d-output="maxPixelRatio"></output><input data-v3d-setting="maxPixelRatio" type="range" min="0.5" max="3" step="0.1"></label>
    <p class="v3d-info" data-v3d-resolution-info></p>
    <label class="v3d-check"><input data-v3d-setting="adaptiveResolution" type="checkbox"> Адаптивное разрешение</label>
    <div class="v3d-field"><span>Целевая частота</span><div data-v3d-select-slot="adaptiveTarget"></div></div>
    <p class="v3d-info">Под нагрузкой масштаб снижается и постепенно восстанавливается. На паузах и в скрытой вкладке замеры не учитываются.</p>
    <p class="v3d-info" data-v3d-context-info></p>
    <p class="v3d-info v3d-renderer-info" data-v3d-renderer-info role="status"></p>
    <button type="button" class="v3d-retry-gpu" data-v3d-retry-gpu hidden>Перезапустить с запросом GPU</button>
    <p class="v3d-info" data-v3d-gpu-help hidden>Перезапуск перезагрузит страницу: сначала сохраните работу. Выбор GPU зависит от браузера, ОС и драйвера; повторный запрос не гарантирует аппаратное ускорение. Если рендерер остаётся программным, включите аппаратное ускорение и проверьте настройки видеокарты.</p>
    <button type="button" class="v3d-retry-gpu" data-v3d-profile hidden>Снять профиль за 10 секунд</button>
    <button type="button" class="v3d-retry-gpu" data-v3d-profile-download hidden>Скачать отчёт JSON</button>
    <p class="v3d-info" data-v3d-profile-status role="status" aria-live="polite"></p>
  </details>
  <details open><summary>Цвет и тон</summary>
    <label class="range-row"><span>Экспозиция</span><output data-v3d-output="exposure"></output><input data-v3d-setting="exposure" type="range" min="0.2" max="3" step="0.01"></label>
    <div class="v3d-field"><span>Тональное отображение</span><div data-v3d-select-slot="toneMapping"></div></div>
    <div class="v3d-field"><span>Цветовое пространство вывода</span><div data-v3d-select-slot="colorSpace"></div></div>
    <p class="v3d-info">Без тонального отображения экспозиция может не влиять на материалы. Линейный вывод предназначен для специальных рабочих процессов.</p>
  </details>
  <details open><summary>Тени</summary>
    <div class="v3d-field"><span>Качество теней</span><div data-v3d-select-slot="shadow"></div></div>
    <p class="v3d-info" data-v3d-shadow-info></p>
    <div class="v3d-field"><span>Фильтр теней</span><div data-v3d-select-slot="shadowType"></div></div>
    <p class="v3d-info" data-v3d-shadow-type-info></p>
    <label class="v3d-check"><input data-v3d-setting="shadowAdjust" type="checkbox"> Ручная коррекция теней</label>
    <label class="range-row"><span>Смещение глубины</span><output data-v3d-output="shadowBias"></output><input data-v3d-setting="shadowBias" type="range" min="-0.01" max="0.01" step="0.00005"></label>
    <label class="range-row"><span>Смещение по нормали</span><output data-v3d-output="shadowNormalBias"></output><input data-v3d-setting="shadowNormalBias" type="range" min="0" max="0.1" step="0.0005"></label>
    <label class="range-row"><span>Радиус фильтра</span><output data-v3d-output="shadowRadius"></output><input data-v3d-setting="shadowRadius" type="range" min="0" max="8" step="0.1"></label>
    <p class="v3d-info">Радиус зависит от выбранного фильтра; мягкий PCF в Three.js не использует этот параметр. Лимит устройства может уменьшить выбранный размер.</p>
  </details>
  <details><summary>Окружающее затенение (AO)</summary>
    <label class="v3d-check"><input data-v3d-setting="ao" type="checkbox"> Включить AO</label>
    <label class="range-row"><span>Сила</span><output data-v3d-output="aoStrength"></output><input data-v3d-setting="aoStrength" type="range" min="0" max="100" step="5"></label>
    <label class="range-row"><span>Радиус, м</span><output data-v3d-output="aoRadius"></output><input data-v3d-setting="aoRadius" type="range" min="0.1" max="10" step="0.1"></label>
    <label class="v3d-check"><input data-v3d-setting="aoHalfRes" type="checkbox"> Половинное разрешение AO</label>
    <label class="v3d-check"><input data-v3d-setting="aoDynamic" type="checkbox"> Динамические объекты</label>
    <label class="v3d-check"><input data-v3d-setting="aoCharacters" type="checkbox"> Персонажи (игрок и NPC)</label>
    <p class="v3d-info" data-v3d-ao-info></p>
  </details>
  <details><summary>Текстуры и камера</summary>
    <div class="v3d-field"><span>Анизотропная фильтрация</span><div data-v3d-select-slot="anisotropy"></div></div>
    <p class="v3d-info" data-v3d-texture-info></p>
    <label class="range-row"><span>Угол обзора камеры</span><output data-v3d-output="cameraFov"></output><input data-v3d-setting="cameraFov" type="range" min="15" max="100" step="1"></label>
    <p class="v3d-info" data-v3d-camera-info></p>
    <label class="v3d-field"><span>Дальность камеры (единицы сцены; 0 — как в приложении)</span><input data-v3d-setting="cameraFar" type="number" min="0" max="1000000" step="0.1"></label>
    <p class="v3d-info" data-v3d-far-info></p>
  </details>
</div>`;
const ranges={renderScale:v=>`${Math.round(v*100)}%`,maxPixelRatio:v=>`${v.toFixed(1)}×`,exposure:v=>v.toFixed(2),shadowBias:v=>v.toFixed(5),shadowNormalBias:v=>v.toFixed(4),shadowRadius:v=>v.toFixed(1),cameraFov:v=>`${Math.round(v)}°`,aoStrength:v=>`${Math.round(v)}%`,aoRadius:v=>`${v.toFixed(1)} м`};

// Options and descriptions are data, not HTML: the Preparatorio component
// renders their text safely and displays the descriptions in its portal menu.
const GRAPHICS_SELECTS = Object.freeze({
  adaptiveTarget:{label:'Целевая частота',options:[
    {value:'30',label:'30 FPS',description:'Меньше нагрузка и энергопотребление.'},
    {value:'45',label:'45 FPS',description:'Компромисс между плавностью и нагрузкой.'},
    {value:'60',label:'60 FPS',description:'Более плавное движение при достаточной производительности.'},
  ]},
  toneMapping:{label:'Тональное отображение',options:[
    {value:'none',label:'Без тональной компрессии',description:'Прямой вывод яркости без сжатия диапазона.'},
    {value:'linear',label:'Линейное',description:'Простое линейное преобразование яркости.'},
    {value:'reinhard',label:'Reinhard',description:'Мягко сжимает яркие участки.'},
    {value:'cineon',label:'Cineon',description:'Кинематографическая кривая с контрастом.'},
    {value:'aces',label:'ACES Filmic',description:'Кинематографическое сжатие светов.'},
    {value:'agx',label:'AgX',description:'Сохраняет оттенки в ярких областях.'},
    {value:'neutral',label:'Neutral',description:'Нейтральное отображение цветов материалов.'},
  ]},
  colorSpace:{label:'Цветовое пространство вывода',options:[
    {value:'srgb',label:'sRGB',description:'Стандартный вывод для экранов.'},
    {value:'linear',label:'Линейное sRGB',description:'Для специальных линейных рабочих процессов.'},
  ]},
  shadow:{label:'Качество теней',options:[
    {value:'auto',label:'Автоматически',description:'Разрешение подстраивается под кадр и нагрузку; при наличии контроллера приложения используются его правила.'},
    {value:'off',label:'Отключены',description:'Не рассчитывать тени от источников света.'},
    {value:'512',label:'Очень низкое · 512²',description:'Минимальная нагрузка и детализация.'},
    {value:'1024',label:'Низкое · 1024²',description:'Небольшая карта теней.'},
    {value:'2048',label:'Среднее · 2048²',description:'Баланс детализации и производительности.'},
    {value:'4096',label:'Высокое · 4096²',description:'Больше деталей, выше расход памяти.'},
    {value:'8192',label:'Ультра · 8192²',description:'Максимальная детализация при поддержке устройства.'},
  ]},
  shadowType:{label:'Фильтр теней',options:[
    {value:'basic',label:'Жёсткий',description:'Чёткие границы без сглаживания.'},
    {value:'pcf',label:'PCF',description:'Сглаживание краёв выборками карты теней.'},
    {value:'soft',label:'Мягкий PCF',description:'Мягкий фильтр в поддерживаемых версиях Three.js.'},
    {value:'vsm',label:'VSM',description:'Вариационная карта с регулируемым размытием.'},
  ]},
  anisotropy:{label:'Анизотропная фильтрация',options:[
    {value:'source',label:'Как в материале',description:'Сохранять настройки каждой текстуры.'},
    {value:'1',label:'1×',description:'Минимальная фильтрация под острыми углами.'},
    {value:'2',label:'2×',description:'Небольшое повышение чёткости.'},
    {value:'4',label:'4×',description:'Умеренное повышение чёткости.'},
    {value:'8',label:'8×',description:'Высокая чёткость наклонных текстур.'},
    {value:'16',label:'16×',description:'Максимум при поддержке устройства.'},
  ]},
});

/** Render the same Preparatorio controls in a popup or a host settings slot. */
export function mountViewportGraphics({host,graphics,legacyIds=false,ui,sections,onSectionChange,retryGpu,onProfile}={}) {
  if(!host?.ownerDocument||!graphics)throw new TypeError('viewport graphics slot and controller are required');
  if(typeof ui?.createCustomSelect!=='function'||typeof ui?.syncRangeFill!=='function')
    throw new TypeError('viewport graphics require createCustomSelect and syncRangeFill from uix-preparatorio');
  const doc=host.ownerDocument, wrapper=doc.createElement('div');wrapper.innerHTML=GRAPHICS_TEMPLATE;
  const root=wrapper.firstElementChild,content=[...root.childNodes];host.append(root);
  const section=mountViewportSection({host:root,key:'graphics',label:'Графика',sections,onSectionChange});
  section.body.append(...content);
  const reset=doc.createElement('button');reset.type='button';reset.dataset.v3dReset='';reset.textContent='Сбросить';reset.title='Восстановить настройки графики';section.actions.append(reset);
  const abort=new AbortController(),signal=abort.signal,inputs=[...root.querySelectorAll('input[data-v3d-setting]')];
  const inputFor=name=>root.querySelector(`input[data-v3d-setting="${name}"]`);
  const selectors=new Map(), signatures=new Map(), disabledStates=new Map();
  let off=()=>{},observer=null,disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;off();abort.abort();observer?.disconnect();
    for(const selector of selectors.values())selector.destroy();selectors.clear();root.remove();};
  try {
  for(const [name,definition] of Object.entries(GRAPHICS_SELECTS)){
    const selector=ui.createCustomSelect({label:definition.label,options:definition.options,onChange(value){
      const next=name==='adaptiveTarget'?Number(value):value;
      if(!graphics.set({[name]:next}))sync(graphics.snapshot());
    }});
    selectors.set(name,selector);
    selector.trigger.dataset.v3dSetting=name;
    selector.menu.dataset.v3dGraphicsSelect=name;
    root.querySelector(`[data-v3d-select-slot="${name}"]`).append(selector.element);
  }
  if(legacyIds){
    selectors.get('shadow').trigger.id='displayShadow';
    for(const [key,id] of Object.entries({exposure:'displayExposure',adaptiveResolution:'displayAdaptive'}))inputFor(key).id=id;
    root.querySelector('[data-v3d-shadow-info]').id='displayShadowInfo';root.querySelector('[data-v3d-output="exposure"]').id='displayExposureValue';
  }
  function sync(state){
    const v=state.settings,hasShadow=state.shadows.length>0;
    for(const input of inputs){const key=input.dataset.v3dSetting;if(input.type==='checkbox')input.checked=!!v[key];else input.value=String(v[key]);
      if(input.type==='range')ui.syncRangeFill(input);
      const output=root.querySelector(`[data-v3d-output="${key}"]`);if(output)output.value=output.textContent=ranges[key]?.(v[key])??String(v[key]);}
    for(const [name,definition] of Object.entries(GRAPHICS_SELECTS)){
      const supported={toneMapping:state.supportedToneMappings,shadowType:state.supportedShadowTypes,colorSpace:state.supportedColorSpaces}[name];
      const options=definition.options.map(option=>{
        const belowMinimum=name==='shadow'&&/^\d+$/.test(option.value)&&Number(option.value)<state.limits.shadowMin;
        const unsupported=supported&&!supported.includes(option.value);
        // Keep a legacy saved low value visible until the user replaces it.
        const disabled=!!unsupported||(belowMinimum&&option.value!==String(v[name]));
        const note=unsupported?' Недоступно в этой версии Three.js.':belowMinimum?` Минимальный размер приложения: ${state.limits.shadowMin}².`:'';
        return {...option,disabled,description:option.description+note};
      });
      const selector=selectors.get(name),signature=JSON.stringify(options);
      if(signature!==signatures.get(name)){signatures.set(name,signature);selector.setOptions(options);}
      if(selector.value!==String(v[name]))selector.setValue(String(v[name]));
      const disabled=(name==='adaptiveTarget'&&!v.adaptiveResolution&&v.shadow!=='auto')||(name==='shadow'&&!hasShadow)||(name==='shadowType'&&(!hasShadow||v.shadow==='off'));
      if(disabledStates.get(name)!==disabled){disabledStates.set(name,disabled);selector.setDisabled(disabled);}
      selector.trigger.value=String(v[name]);
    }
    root.querySelector('[data-v3d-shadow-type-info]').textContent=state.supportedShadowTypes.includes('soft')?'':'Мягкий PCF недоступен в этой версии Three.js; используйте PCF.';
    inputFor('shadowAdjust').disabled=!hasShadow||v.shadow==='off';
    for(const key of ['shadowBias','shadowNormalBias','shadowRadius'])inputFor(key).disabled=!hasShadow||v.shadow==='off'||!v.shadowAdjust||(key==='shadowRadius'&&v.shadowType==='soft');
    inputFor('cameraFov').disabled=!state.perspective;
    inputFor('ao').disabled=!state.aoSupported;
    for(const key of ['aoStrength','aoRadius','aoHalfRes','aoDynamic','aoCharacters'])inputFor(key).disabled=!state.aoSupported||!v.ao;
    root.querySelector('[data-v3d-ao-info]').textContent=state.aoSupported?'Категории задаются приложением. Непомеченные объекты считаются статичными; скиннованные меши — персонажами. AO нагружает видеокарту.':'AO недоступен: нужны дополнения Three.js r186/r187, WebGL2 и перспективная камера.';
    root.querySelector('[data-v3d-far-info]').textContent=`Текущая дальность: ${state.effectiveCameraFar??'—'}. Большая дальность снижает точность буфера глубины; 0 возвращает значение приложения.`;
    root.querySelector('[data-v3d-resolution-info]').textContent=`Фактическая плотность: ${state.effectivePixelRatio.toFixed(2)}×${v.adaptiveResolution?` · адаптация ${Math.round(state.adaptiveScale*100)}%`:''}.`;
    const attrs=state.limits.attributes;
    root.querySelector('[data-v3d-context-info]').textContent=attrs?`Сглаживание MSAA: ${attrs.antialias?'включено':'выключено'} · буфер глубины: ${attrs.depth?'есть':'нет'}. Параметры WebGL-контекста задаются при создании окна.`:'Сглаживание и параметры WebGL-контекста задаются при создании окна.';
    const info=state.limits.rendererInfo??{classification:'unknown',name:null};
    root.querySelector('[data-v3d-renderer-info]').textContent=info.classification==='software'
      ?`Программный рендерер (CPU): ${info.name}.`
      :info.classification==='reported'?`Рендерер WebGL: ${info.name}. Выбор устройства сообщает браузер.`
      :'Рендерер WebGL скрыт или недоступен: определить CPU/GPU нельзя.';
    const canRetry=typeof retryGpu==='function',gpuHelp=root.querySelector('[data-v3d-gpu-help]');
    root.querySelector('[data-v3d-retry-gpu]').hidden=info.classification!=='software'||!canRetry;
    gpuHelp.hidden=info.classification!=='software';
    gpuHelp.textContent=canRetry
      ?'Перезапуск перезагрузит страницу: сначала сохраните работу. Выбор GPU зависит от браузера, ОС и драйвера; повторный запрос не гарантирует аппаратное ускорение. Если рендерер остаётся программным, включите аппаратное ускорение и проверьте настройки видеокарты.'
      :'Выбор GPU зависит от браузера, ОС и драйвера. Проверьте аппаратное ускорение и настройки видеокарты.';
    const actual=state.shadowInfo?.size??state.shadows[0]?.size;
    root.querySelector('[data-v3d-shadow-info]').textContent=!hasShadow?'В сцене нет источника, отбрасывающего тени.':v.shadow==='off'?'Тени отключены':`Фактически: ${actual||'—'}² · предел устройства ${state.limits.shadowCeiling}²${v.shadow!=='auto'&&Number(v.shadow)>state.limits.shadowCeiling?' · ограничено устройством':''}.`;
    root.querySelector('[data-v3d-texture-info]').textContent=`Предел устройства: ${state.limits.maxAnisotropy}×. Переопределяются текстуры текущих материалов; исходные значения можно восстановить.`;
    root.querySelector('[data-v3d-camera-info]').textContent=state.perspective?'Применяется к перспективной камере.':'В ортографическом виде угол обзора не используется.';
  }
  for(const input of inputs){
    const event=input.type==='range'?'input':'change';
    input.addEventListener(event,()=>{
      const value=input.type==='checkbox'?input.checked:Number(input.value);
      if(!graphics.set({[input.dataset.v3dSetting]:value}))sync(graphics.snapshot());
    },{signal});
  }
  root.querySelector('[data-v3d-reset]').addEventListener('click',()=>graphics.reset(),{signal});
  root.querySelector('[data-v3d-retry-gpu]').addEventListener('click',()=>retryGpu?.(),{signal});
  const profile=root.querySelector('[data-v3d-profile]'),download=root.querySelector('[data-v3d-profile-download]'),status=root.querySelector('[data-v3d-profile-status]');
  let report=null;profile.hidden=typeof onProfile!=='function';
  profile.addEventListener('click',async()=>{
    if(profile.disabled)return;profile.disabled=true;download.hidden=true;status.textContent='Измеряем кадры; не скрывайте окно и не меняйте сцену…';
    try{
      report=await onProfile();if(disposed)return;
      const gpu=report?.gpu?.elapsedMsPerRendererCall;
      status.textContent=`${report?.fps??'—'} FPS · ${report?.metadata?.drawingBuffer?.join(' × ')??'—'} px · таймер WebGL: ${gpu?`${gpu.mean} мс/вызов`:'замер недоступен'}${report?.hiddenDuringMeasurement?' · окно скрывалось':''}. Полные данные — в JSON.`;
      download.hidden=false;
    }catch(error){if(!disposed)status.textContent=`Не удалось снять профиль: ${error?.message??error}`;}
    finally{if(!disposed)profile.disabled=false;}
  },{signal});
  download.addEventListener('click',()=>{
    if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=doc.createElement('a');link.href=url;link.download='viewport-profile.json';doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },{signal});
  section.toggle.addEventListener('click',()=>{if(!section.expanded)for(const selector of selectors.values())selector.close();},{signal});
  off=graphics.subscribe(sync,{immediate:false});sync(graphics.snapshot());
  const Observer=doc.defaultView?.ResizeObserver;
  observer=Observer?new Observer(()=>{
    for(const selector of selectors.values())if(!selector.trigger.isConnected||!selector.trigger.getClientRects().length)selector.close();
  }):null;
  observer?.observe(root);
  return {root,section,
    containsPopup:target=>[...selectors.values()].some(selector=>selector.menu.contains(target)),
    closeSelects:()=>{for(const selector of selectors.values())selector.close();},dispose};
  } catch(error){dispose();throw error;}
}

/** Three built-in subsections can also be mounted in an existing host menu. */
export function mountViewportSettings({host,environment,display,graphics,ui,sections,onSectionChange,onEnvironmentSelect,legacyIds=false,retryGpu,onProfile}={}) {
  if(!host?.ownerDocument)throw new TypeError('viewport settings host is required');
  let environmentUI=null,displayUI=null,graphicsUI=null,slot=null,disposed=false;
  try {
    environmentUI=mountViewportEnvironment({host,environment,sections,onSectionChange,onSelect:onEnvironmentSelect,legacyIds});
    displayUI=mountViewportDisplay({host,display,sections,onSectionChange});
    slot=host.ownerDocument.createElement('div');slot.dataset.v3dGraphicsSlot='';if(legacyIds)slot.id='viewportGraphicsSlot';host.append(slot);
    graphicsUI=mountViewportGraphics({host:slot,graphics,legacyIds,ui,sections,onSectionChange,retryGpu,onProfile});
  } catch(error) {graphicsUI?.dispose();slot?.remove();displayUI?.dispose();environmentUI?.dispose();throw error;}
  return {environment:environmentUI,display:displayUI,graphics:graphicsUI,
    containsPopup:target=>graphicsUI.containsPopup(target),closeSelects:()=>graphicsUI.closeSelects(),
    dispose(){if(disposed)return;disposed=true;graphicsUI.dispose();slot.remove();displayUI.dispose();environmentUI.dispose();}};
}

let nextViewportMenuId=0;

/** Wire common slots. Hosts can provide existing mode/graphics controllers. */
export function mountViewportChrome({root,viewport,modeOptions={},graphicsOptions={},environmentOptions={},settingsOptions={},modes=null,graphics=null,environment=null,display=null,classes={},ui}={}) {
  if(!root?.querySelector||!viewport)throw new TypeError('viewport chrome requires root and viewport');
  if(typeof ui?.createCustomSelect!=='function'||typeof ui?.syncRangeFill!=='function')
    throw new TypeError('viewport chrome requires createCustomSelect and syncRangeFill from uix-preparatorio');
  const modeHost=root.querySelector('[data-v3d-mode-host]'),toolHost=root.querySelector('[data-v3d-tool-host]');
  const panel=root.querySelector('[data-v3d-graphics-panel]'),toggle=root.querySelector('[data-v3d-graphics-toggle]');
  if(!modeHost||!toolHost||!panel||!toggle)throw new Error('viewport chrome slots are missing');
  const ownModes=!modes, ownGraphics=!graphics,ownEnvironment=!environment,ownDisplay=!display;
  modes ||= createViewportModes(modeOptions);graphics ||= createViewportGraphics(viewport,graphicsOptions);
  let modeUI,graphicsUI,gridContribution,contributionsUI,contributionHost,classUI,observer,disposed=false,offDispose=()=>{};
  const abort=new AbortController(),signal=abort.signal;
  const document=root.ownerDocument,originalParent=panel.parentNode,originalNext=panel.nextSibling,originalStyle=panel.getAttribute('style');
  const originalPanelId=panel.getAttribute('id'),originalControls=toggle.getAttribute('aria-controls');
  const originalWidth=panel.style.width,originalMaxHeight=panel.style.maxHeight;
  const restorePanel=()=>{
    panel.hidden=true;toggle.setAttribute('aria-expanded','false');
    if(originalPanelId===null)panel.removeAttribute('id');else panel.setAttribute('id',originalPanelId);
    if(originalControls===null)toggle.removeAttribute('aria-controls');else toggle.setAttribute('aria-controls',originalControls);
    if(originalStyle===null)panel.removeAttribute('style');else panel.setAttribute('style',originalStyle);
    if(originalParent)originalParent.insertBefore(panel,originalNext?.parentNode===originalParent?originalNext:null);
  };
  try{
    if(!panel.id)panel.id=`v3d-settings-panel-${++nextViewportMenuId}`;
    toggle.setAttribute('aria-controls',panel.id);
    display ||= createViewportDisplay();
    environment ||= createViewportEnvironments(viewport,{...environmentOptions,display,invalidate:()=>{environmentOptions.invalidate?.();graphicsOptions.invalidate?.();}});
    if(typeof environment.setGrid==='function')gridContribution=contributeStudioGrid({display,environment,
      get:()=>environment.gridWanted!==false,set:value=>environment.setGrid(value)});
    modeUI=mountViewportModes({modes,modeHost,toolHost,ui});
    graphicsUI=mountViewportSettings({host:panel,environment,display,graphics,ui,...settingsOptions});
    contributionHost=document.createElement('div');contributionHost.className='v3d-contributions';
    contributionHost.dataset.v3dContributions='';panel.append(contributionHost);
    contributionsUI=mountViewportContributions({host:contributionHost,root:document});
    classUI=mountViewportClasses({root,panel,classes});
    // Dock panels commonly clip descendants. Portal the popup to the document
    // so every control remains reachable even in a small or resized viewport.
    document.body.append(panel);
    // Once portaled, absolute top:100% would briefly place it below the
    // document on the first opening. Measure it invisibly at a fixed position
    // before revealing it, so neither users nor hit testing see that jump.
    panel.style.position='fixed';panel.style.top='0px';panel.style.left='0px';panel.style.right='auto';
    const close=()=>{graphicsUI.closeSelects();panel.hidden=true;panel.style.visibility='';toggle.setAttribute('aria-expanded','false');};
    const position=()=>{
      if(panel.hidden)return;
      const win=document.defaultView,anchor=toggle.getBoundingClientRect(),margin=8,gap=5;
      if(!toggle.isConnected||!toggle.getClientRects().length||anchor.bottom<=0||anchor.top>=win.innerHeight||anchor.right<=0||anchor.left>=win.innerWidth){close();return;}
      // Let the host stylesheet size the menu; only clamp it to the viewport.
      // Clear the previous positioning pass first so resize can grow it again.
      panel.style.width=originalWidth;panel.style.maxHeight=originalMaxHeight;
      const measured=panel.getBoundingClientRect().width;
      const width=Math.max(1,Math.min(measured||320,win.innerWidth-margin*2));
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
    toggle.addEventListener('click',()=>{
      if(!panel.hidden){close();return;}
      panel.style.visibility='hidden';panel.hidden=false;toggle.setAttribute('aria-expanded','true');position();
      if(!panel.hidden)panel.style.visibility='';
    },{signal});
    document.addEventListener('pointerdown',event=>{
      if(!panel.hidden&&!panel.contains(event.target)&&!toggle.contains(event.target)&&!graphicsUI.containsPopup(event.target))close();
    },{signal});
    // The custom select handles its own Escape first. Do not also close the
    // surrounding graphics panel until the next Escape.
    document.addEventListener('keydown',event=>{if(!event.defaultPrevented&&event.key==='Escape'&&!panel.hidden){close();toggle.focus();}},{signal});
    document.defaultView?.addEventListener('resize',position,{signal});
    // Only scrolling the document or an ancestor of the anchor moves it.
    // In particular, scrolling inside the popup must not remeasure it: clearing
    // max-height momentarily clamps scrollTop and makes the menu bounce.
    document.addEventListener('scroll',event=>{
      const source=event.target;
      if(source===document||source===document.defaultView||source?.contains?.(toggle))position();
    },{capture:true,signal});
    if(globalThis.ResizeObserver){observer=new ResizeObserver(position);observer.observe(toggle);observer.observe(root);}
    offDispose=viewport.onDispose?.(dispose)??(()=>{});
  }catch(error){abort.abort();observer?.disconnect();classUI?.dispose();contributionsUI?.dispose();contributionHost?.remove();restorePanel();modeUI?.dispose();graphicsUI?.dispose();gridContribution?.dispose();if(ownEnvironment)environment?.dispose();if(ownDisplay)display?.dispose();if(ownModes)modes.dispose();if(ownGraphics)graphics.dispose();throw error;}
  function dispose(){
    if(disposed)return;disposed=true;offDispose();abort.abort();observer?.disconnect();restorePanel();
    classUI?.dispose();contributionsUI?.dispose();contributionHost?.remove();modeUI.dispose();graphicsUI.dispose();gridContribution?.dispose();if(ownEnvironment)environment.dispose();if(ownDisplay)display.dispose();if(ownModes)modes.dispose();if(ownGraphics)graphics.dispose();
  }
  return {modes,graphics,display,environment,settings:graphicsUI,contributions:contributionsUI,dispose};
}
