# viewport3d — необязательная базовая область

Область и общий runtime расположены в `framework-preparatorio/scopes/viewport3d`. По умолчанию встроенная область **не регистрируется, не монтируется и не создаёт WebGL-контекст**. Приложение явно включает её конфигурацией при сборке. Собственных копий Three.js нет: хост передаёт используемый им `THREE`.

## Структура

В корне находятся `index.js` — публичная точка входа и активация области — и этот `README.md`.
Внутренние модули распределены по папкам:

- `camera/` — орбита, команды камеры и gizmo;
- `environment/` — окружения и сетка пола;
- `graphics/` — настройки и контроллер графики;
- `ui/` — разметка, режимы, секции и настройки отображения;

Импортируйте API через `framework-preparatorio/scopes/viewport3d`, а не по
внутренним путям: публичный путь и экспорты не изменились.


### Тема и классы приложения

`styles.css` содержит только геометрию и правила, необходимые для работы
viewport: расположение сцены, слотов и gizmo, скрытие и обработку размеров.
Цвета, фон, шрифты, рамки, отступы и состояния кнопок определяет приложение.
Стили popup берутся от хоста даже после его переноса в `document.body`.

При активации встроенной области передайте `viewport3d.classes`, а при отдельном
монтировании — `mountViewportChrome({..., classes})`. Значение слота — строка
классов или массив строк. Классы добавляются и к элементам, появившимся позже
(инструменты, разделы и вклады), затем снимаются при `dispose`; уже имевшиеся
классы узла сохраняются. Например:

```js
viewport3d: { THREE, ui, classes: {
  header: 'b-header b-header-lumino',
  navigationButton: 'b-header-btn', settingsToggle: 'b-header-btn',
  settingsPanel: 'b-menu-pop app-viewport-menu',
  section: 'app-settings-section', tool: 'app-tool',
} }
```

Слоты: `scope`, `header`, `modeHost`, `navigation`, `navigationButton`,
`settingsMenu`, `settingsToggle`, `settingsPanel`, `stage`, `toolHost`, `tool`,
`gizmo`, `gizmoAxis`, `gizmoCenter`, `section`, `sectionHeading`, `sectionToggle`,
`sectionActions`, `sectionBody`, `graphics`, `displayItem`, `environmentOption`,
`contribution`, `contributionTitle`. Встроенная область саму тему не выбирает.
Если класс приложения скрывает popup через `display:none`, укажите в теме
правило показа для состояния `:not([hidden])`. Ширина меню задаётся темой;
каркас лишь ограничивает её размерами окна и позиционирует popup.

## Включение области

```js
import * as THREE from 'three';
import {createCustomSelect, syncRangeFill} from 'uix-preparatorio';
import 'uix-preparatorio/styles.css';
import 'framework-preparatorio/scopes/viewport3d/styles.css';
import {createScopeRegistry, registerScopeDefinitions, mountScopeNodes} from 'framework-preparatorio';

const registry = createScopeRegistry();
registerScopeDefinitions(registry, {
  builtInScopes: {viewport3d: {enabled: true}},
});
mountScopeNodes(registry, document);
const node = document.querySelector('[data-viewport3d-scope]');
const dispose = registry.get('viewport3d').activate({
  node,
  viewport3d: {THREE, ui: {createCustomSelect, syncRangeFill}, plugins: [], onReady(viewport) {
    viewport.camera.position.z = 4;
  }},
});
// Позже: dispose();
```

Для готового интерфейса нужны `uix-preparatorio` **2.0.3 или новее** и оба
CSS из примера. Хост передаёт `ui` явно, поэтому без DOM библиотека интерфейса
не импортируется автоматически; голые runtime и контроллеры по-прежнему могут
использоваться без неё. Приложение должно задать размер контейнера.

Встроенная область содержит панель управления без повторного названия вкладки,
базовый режим «Просмотр»,
инструмент «Обзор», управление камерой и меню дополнительных настроек с кнопкой-иконкой. При `loop: false`
изменения навигации, графики и размера запрашивают одиночный кадр; либо передайте
`loop: (viewport, time) => { /* обновление и viewport.render() */ }`. При
ошибке запуска ресурсы очищаются. Возвращённая функция имеет свойства
`viewport3d`, `modes`, `graphics`, `environment`, `display`, `orbit`, `navigation`. Управление объектами и выбор
персонажа в каркас не встроены: их добавляет приложение.


### Навигация и gizmo

Встроенная область по умолчанию содержит розу осей и кнопки «−», процент
масштаба, «+», «Вписать сцену» и полноэкранный режим (выход — Escape).
X/Y/Z устанавливают вид справа/сверху/спереди, центр — перспективный ракурс;
роза отслеживает кватернион камеры и обновляется при каждом render. Numpad
1/3/7 и Ctrl+1/3/7 выбирают прямые и обратные виды, Numpad 5 — перспективу,
Home — вписывание. Сочетания работают при фокусе внутри области, не в поле ввода.
Процент показывает масштаб относительно первоначального положения либо последнего
вписывания; нажатие на процент возвращает этот масштаб, сохраняя ракурс.
Поддерживаются перспективная и ортографическая камеры.

Вписывание учитывает видимые mesh/points/line сцены, но не встроенную сетку;
для исключения объекта с потомками установите `object.userData.viewport3dExcludeFromFit = true`.
Для выбора конкретной модели передайте `viewport3d.navigationOptions.fitObject`
(объект Three.js или функция, возвращающая объект). При пустой сцене вписывание
ничего не меняет. `viewport3d.navigationOptions.isEnabled` позволяет временно
блокировать команды. `dispose.navigation` предоставляет `setView`, `fit`,
`zoom`, `resetBase` и `sync`. `orbit: false` отключает ввод мышью/клавишами
орбиты, но встроенные кнопки продолжают менять камеру. Если приложение применяет
свои camera controls, синхронизировать их target с `navigation` нужно самому;
для полностью собственной камеры переопределите scope или используйте
`mountViewportGizmo`/`mountViewportNavigation` отдельно. При `loop: false`
после внешних изменений камеры вызывайте `viewport.render()`.

`mountViewportGizmo({host, THREE, camera, setView, isEnabled, subscribe})` —
переиспользуемая роза для собственной оболочки: `host` содержит
`[data-gizmo-center]`, `subscribe(place)` возвращает функцию отписки. Она не
создаёт дополнительных копий Three.js, поддерживает несколько экземпляров и
очищает обработчики и созданные кнопки через `dispose()`.

Если приложение объявляет собственный паспорт `id: 'viewport3d'`, настройка `builtInScopes.viewport3d.enabled` включает или исключает этот паспорт; при включении сохраняются его шаблон, селектор, инструменты и реализация. Можно связать собственную реализацию обычным `bindScopeImplementations` и оставить существующий интерфейс. Когда настройка целиком отсутствует, собственные области старых приложений регистрируются как прежде; встроенная область не добавляется. Удаление этой настройки не скрывает произвольную область, зарегистрированную вручную.

Для индивидуального состава доступна и фабрика `createViewport3DScope({enabled: true, scope: {...}})`. Она возвращает `null` без явного `enabled: true`; идентификатор области менять нельзя.

## Runtime без разметки

```js
import * as THREE from 'three';
import {createViewport3D} from 'framework-preparatorio/scopes/viewport3d';
const viewport = createViewport3D({
  THREE,
  container: document.querySelector('#canvas-host'),
  cameraOptions: {kind: 'perspective', args: [34, 1, 0.1, 100]},
  rendererOptions: {antialias: true},
  scopes: ['viewport3d', 'properties'],
  apis: {color: 0x54c7a9},
});
viewport.registerPlugin({
  id: 'example-mesh',
  requires: {scopes: ['properties'], apis: ['color']},
  activate({viewport, apis, defer}) {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial({color: apis.color});
    const mesh = new THREE.Mesh(geometry, material);
    viewport.scene.add(mesh);
    defer(() => {mesh.removeFromParent(); geometry.dispose(); material.dispose();});
    return {api: {mesh}};
  },
});
viewport.camera.position.z = 4;
viewport.onResize(({width, height}) => {
  viewport.camera.aspect = width / height;
  viewport.camera.updateProjectionMatrix();
});
viewport.observeResize();
viewport.start(() => viewport.render(), {driver: 'renderer'});
// Позже: viewport.dispose();
```

## Режимы, инструменты и собственная разметка

Можно встроить общие контроллеры в существующее приложение, не заменяя его
сцену и разметку. `VIEWPORT3D_HEADER_TEMPLATE` и `VIEWPORT3D_TOOLS_TEMPLATE`
дают готовые слоты, `mountViewportChrome({root, viewport, ui: {createCustomSelect,
syncRangeFill}, modeOptions, graphicsOptions})` их заполняет. Селект режима и
выпадающие настройки — настоящие компоненты Preparatorio с описаниями вариантов;
ползунки используют библиотечные `.range-row` и `syncRangeFill` при вводе,
программной синхронизации и сбросе. Меню дополнительных настроек и его выпадающие списки
переносятся в `document.body`, чтобы не обрезаться границами дока. Escape сначала
закрывает вложенный список, следующий Escape — панель. `chrome.dispose()`
возвращает панель на место и снимает обработчики; `viewport.dispose()` вызывает
эту очистку автоматически.

`createViewportModes` не зависит от DOM. Единственный встроенный режим —
`view` («Просмотр») с единственным инструментом `orbit` («Обзор»). Дескрипторы
приложения передаются массивами `tools` и `modes` либо добавляются методами
`registerTool`/`registerMode`. У режима указываются `id`, `label`, `tools`,
`defaultTool`, при необходимости `description` и `available`. Состояние
`modes.value` и `subscribe` содержат выбранные режим и инструмент; каждый
режим помнит свой последний инструмент в течение сеанса. `setMode`, `setTool`,
`setAvailable` и `removeMode` проверяют доступность; базовый `view` нельзя
удалить или выключить. `onModeChange`/`onToolChange` могут вернуть `false`,
чтобы отклонить переход. Для отдельной разметки есть
`mountViewportModes({modes, modeHost, toolHost, ui: {createCustomSelect}})`.
Он возвращает `select` — кнопку-combobox (не нативный `<select>`),
`selectController` — контроллер Preparatorio и `dispose()`. Для смены режима
используйте `modes.setMode()`, а не установку DOM `value` и событие `change`.
Сохранение выбора и реальные действия инструментов остаются у хоста.

Если у приложения уже есть управление камерой, используйте его; иначе
`createViewportOrbit(viewport, {target, onChange, isEnabled})` предоставляет
вращение, перемещение, масштаб, клавиатуру и жесты для перспективной и
ортографической камеры. `isEnabled()` может приостановить обработку ввода;
встроенная область делает это, когда активен не `orbit`. Вызывайте `dispose()`
при размонтировании. Приложение вправе сохранить свои жесты, например вращение
модели вместо вращения камеры.

## Студия, окружения и вклады отображения

Встроенная область открывает общее меню кнопкой с иконкой слоёв, как в Morphia.
В нём уже находятся группы «Окружение», «Отображение» и «Графика»: графика —
раздел меню, а не отдельная кнопка в шапке. Группы сворачиваются независимо;
кнопка сброса графики сбрасывает только графические параметры.

Вклады приложений из `viewportContributions` автоматически образуют в том же
меню дополнительные подписанные группы (после встроенных). Используется тот же
реестр, что и в Morphia: для каждого вклада указываются `id`, `label`, CSS
`selector` исходного DOM-узла и при необходимости `order` и `owner`. Вклады
можно регистрировать до или после монтирования области; поздно появившиеся узлы
подхватываются автоматически. При удалении вклада или закрытии области узел
возвращается на исходное место вместе с его классами и ролью. Один исходный узел
не может одновременно принадлежать двум встроенным меню.

```js
import {registerViewportContribution} from 'framework-preparatorio';
// #my-settings — уже существующий DOM-узел приложения, не HTML-строка.
const unregister = registerViewportContribution({
  id: 'my-settings', label: 'Настройки приложения', selector: '#my-settings', order: 20,
});
// Позже: unregister();
```


Общий viewport поставляет зарезервированную карту `studio`, её палитру и сетку,
а также сворачиваемые разделы «Окружение», «Отображение» и «Графика». Кнопка
«Сбросить» относится только к настройкам графики и не разворачивает раздел.
`settingsOptions: {sections, onSectionChange}` позволяет хосту сохранить ключи
`viewport3d-environment`, `viewport3d-display`, `viewport3d-graphics` в своём
хранилище; другие ключи не удаляются. При закрытии панелей вложенные меню
освобождаются. В Morphia их состояние сохраняется вместе с остальным состоянием.

`createViewportEnvironments(viewport, options)` — универсальный адаптер сцены:
`list()`, `listAll()`, `register(descriptor)`, `set(id)`, `setEnabled(id, bool)`,
`onChange(fn)`, `setGrid(bool)` и `dispose()`. `studio` нельзя выключить или
заменить плагином. Переключения сериализованы; неактуальные результаты не
применяются. В случае ошибки адаптер возвращается к «Студии». Сетка создаётся с
переданным хостом `THREE`, а её видимость в других окружениях выключена;
предпочтение пользователя восстанавливается при возврате в студию. По желанию
хост передаёт `studioGrid` как уже добавленный в сцену объект: он сохраняет его
внешний вид и право владения, а общая логика возвращает исходную видимость и
не освобождает этот объект. `preserveBackground: true` не меняет фон при mount.
Morphia использует собственный адаптер `WorldManager`, чтобы сохранить физику,
точки появления, освещение и шейдеры своих карт.

Для сборки Vite имена импортируемых файлов должны быть статически известны, так
что хост передаёт результат `import.meta.glob`, а проверка manifest и сортировка
выполняются в общем коде. Пример для расположения в `src/plugins/worlds/`:

```js
import {discoverViewportEnvironments, mountViewportChrome} from 'framework-preparatorio/scopes/viewport3d';
const manifests = import.meta.glob('/src/plugins/worlds/*/manifest.json', {eager: true, import: 'default'});
const entries = import.meta.glob('/src/plugins/worlds/*/*.js');
const environments = discoverViewportEnvironments({manifests, entries});
const chrome = mountViewportChrome({root, viewport, ui,
  environmentOptions: {environments}, settingsOptions: {sections, onSectionChange}});
```

Manifest, например, содержит `{"kind":"world","id":"room","label":"Комната",
"entry":"room.js","order":2}`; `entry` по умолчанию — `world.js`, пути за
пределы папки не допускаются. Добавление файла требует пересборки/перезапуска
Vite. Каждое окружение экспортирует `mount(ctx)`. Универсальный `ctx` содержит
`THREE`, `scene`, `camera`, `renderer`, `signal`, `add(object)`, `own(cleanup)`,
`look(options)` и `contributeDisplay(item)`. Объекты, переданные в `add`,
удаляются из сцены, но их геометрию/материал/текстуры плагин освобождает сам
через `own`; при размонтировании `signal` отменяется до очистки. Асинхронный
код должен проверять `signal.aborted`, а необработанные ошибки mount приводят
к откату. Поддержка физики и дополнительных полей зависит от хоста.

`createViewportDisplay()` позволяет регистрировать независимые переключатели
`{id, label, get, set, order?, description?}`. Возвращённая из `register`
функция их удаляет; `refresh()` синхронизирует значения. Если в mount вызвать
`ctx.contributeDisplay(item)`, переключатель автоматически снимается при смене
карты. Общий `contributeStudioGrid` добавляет «Сетка пола» только в активной
студии; Морфия отдельно добавляет «Скелет персонажа». Таким образом пункты
не зашиты в список контроллера и не пропадают у остальных поставщиков при
переключении карт. При самостоятельном создании адаптера через
`createViewportEnvironments` передайте ему `display`, если картам нужны вклады.

`viewportRendererInfo(renderer)` сообщает известные программные рендереры как
`software`; имя другого устройства — `reported`, скрытое имя — `unknown`.
Это не доказывает наличие или отсутствие аппаратного ускорения при скрытом
драйвере. Хост может передать `retryGpu` в `mountViewportSettings`: в Morphia
он перезагружает страницу и повторяет запрос high-performance, но выбор GPU
остаётся за браузером/ОС/драйвером, а успешное переключение не гарантируется.
Перед перезагрузкой необходимо сохранить работу.

## Настройки графики

`createViewportGraphics(viewport, options)` управляет **реальным** рендерером:

- масштабом и пределом плотности экрана, опциональным адаптивным разрешением;
- экспозицией, тональным отображением и пространством вывода;
- глобальным освещением (IBL): переключатель `globalLighting` и интенсивность
  `globalLightingIntensity` (0–3, `scene.environmentIntensity`);
- выключением, разрешением и фильтром теней, ручными bias/normal bias/radius;
- анизотропией текстур и FOV перспективной камеры.

MSAA и другие параметры контекста показываются для информации: их нельзя
переключить без пересоздания WebGL-контекста. FOV недоступен для
ортографической камеры. Эффект экспозиции и радиуса фильтра зависит от выбранных
алгоритмов; по умолчанию настройки приложения/рендерера сохраняют исходный вид.
В Three.js r186 и новее прежний `PCFSoftShadowMap` удалён, хотя константа всё
ещё экспортируется: этот пункт отключён, а сохранённый `soft` заменяется на PCF.
Недоступные в Three.js хоста варианты не выдаются за рабочие настройки.
Размер теней и плотность ограничены возможностями устройства; software GPU
получает консервативный потолок. Это не гарантия доступного объёма GPU-памяти.

`settings` и `defaults` — простые объекты, `onChange(settings, reason)`
передаёт значения для сохранения хостом. `value` — копия настроек,
`snapshot()` дополнительно возвращает фактическую плотность, ограничения,
тени и поддерживаемые алгоритмы. `set(patch)`, `reset()`, `refresh()` и
`subscribe(fn)` доступны отдельно. Вызывайте `refresh()` после замены модели,
материалов или света. Для рендера по требованию передайте `invalidate`, чтобы
изменения запрашивали новый кадр. Замеры адаптивного разрешения учитывают
только вызовы `viewport.render()` и пропускают паузы, скрытую вкладку и кадры,
для которых `canSample()` вернул `false` (например, загрузка модели).

Глобальное освещение без адаптера управляет `scene.environment` напрямую:
при выключении карта сохраняется и `scene.environment` становится `null`,
при включении — возвращается; интенсивность пишется в
`scene.environmentIntensity` (если свойство есть в Three.js хоста).
`dispose()` возвращает исходные карту и интенсивность. Если хост владеет
светом сам (Morphia: полусфера/эмбиент + провайдер окружения Prismia),
передайте `globalLightingAdapter` с `setEnabled(bool)`,
`setIntensity(number)` и опциональным `snapshot()` — контроллер делегирует
ему и не трогает `scene.environment` сам. Направленные источники
(ключевой/заполняющий/контровой) адаптер обычно не затрагивает.
`snapshot().globalLighting` сообщает фактическое состояние
(`enabled`, `intensity`, `hasEnvironment`, `environmentIntensity`,
`viaAdapter`). Отключение IBL — диагностический приём: сам по себе он
даёт лишь часть выигрыша, если просадки вызваны волосами, тенями или
лишними проходами сцены.

Если хост сам управляет динамическим качеством теней, передайте `shadowAdapter`
с `setQuality(size|null)`, `snapshot()`, опциональными `minSize` и
`resetAdjust()`. Для временно скрытых исходных материалов передайте
`additionalMaterials: () => iterable`: при смене теней/тона обновятся и они.
`mountViewportGraphics({host, graphics, ui: {createCustomSelect, syncRangeFill}})`
встраивает те же поля в свой контейнер; `legacyIds: true` оставляет ID старых
контролов Morphia, но `displayShadow` теперь указывает на кнопку-combobox, а не
на `<select>`. При собственной внешней панели используйте `containsPopup(target)`
для проверки вложенного портала и `closeSelects()` при закрытии панели; для
события `click` учитывайте `event.composedPath()`, поскольку библиотека может
уже удалить выбранный пункт из DOM. Вызов `dispose()` у возвращённого UI удаляет
его селекты и порталы. Контроллер графики не владеет геометрией, светом или
материалами: `dispose()` снимает подписки и возвращает
переопределённую анизотропию, но не уничтожает сцену и не откатывает настройки
рендерера. Ресурсами по-прежнему управляет создавший их хост.

## Расширения и владение

`requires.scopes`, `requires.apis`, `requires.plugins` — необязательные массивы. Плагин с отсутствующей зависимостью ожидает её появления. `registerPlugin`, `registerPlugins`, `unregisterPlugin`, `getPlugin`, `listPlugins`, `setScopeAvailable` и `setApi` управляют расширениями. При потере зависимости сначала останавливаются зависимые расширения; при восстановлении они включаются снова. Дубликаты и циклы отклоняются.

`activate({viewport, scopes, apis, signal, defer})` вызывается синхронно. Зависимости читаются через `scopes.has(id)`, `apis` и `viewport.getPlugin(id)`. На очистку `signal` отменяется, а `defer` вызывается в обратном порядке, в том числе при исключении. Для асинхронной работы следите за `signal`, чтобы не оставлять ресурсы после отключения.

Если `renderer` или `canvas` передан извне, он остаётся собственностью хоста; `ownRenderer: true` передаёт владение рендерером области. Область не освобождает чужие геометрию, материалы и текстуры: создавший их плагин регистрирует очистку через `defer`. `dispose()` идемпотентен. `start` поддерживает `raf` и `renderer`, но одновременно работает только один цикл; внешний цикл может вызывать `render()` напрямую. `onResize`, `observeResize`, `disconnectResize`, `ignoreZeroSize`, `configure` и `retryWithoutAntialias` дают хосту контроль размеров и параметров.

## Проверки

Из корня пакета: `npm test`. Тесты проверяют включение, исключение, пользовательский паспорт, жизненный цикл, владение рендерером и разрешение зависимостей расширений.

## Строка состояния viewport3d

Штатный шаблон содержит `[data-v3d-status]`; при `activateViewport3DScope`
компонент подключается автоматически (отключение: `viewport3d.status: false`).
По умолчанию он выводит FPS **отрисовки данного viewport** и мировые XYZ
активного Three.js объекта. До первой секунды FPS и без выбора выводится `—`.
При остановке отрисовки последнее значение FPS сохраняется: это не FPS экрана.

```js
import { mountViewportStatus } from 'framework-preparatorio/scopes/viewport3d';

// Для штатного scope эти параметры передаются как viewport3d.status:
const statusConfig = {
  layers: [projectStatus, appStatus], // базовый проект -> наследник
  getContext: () => ({ engine }),
};
// Для собственной оболочки, как в Morphia:
const status = mountViewportStatus({
  root: node.querySelector('[data-v3d-status]'), viewport,
  ...statusConfig,
});
// Передать фактически выбранный объект при смене выбора:
viewport.setActiveObject(selectedObject ?? null);
// При изменении данных без отрисовки:
status.update();
// При удалении оболочки:
status.dispose();
```

Каждый слой — `{groups: [], items: []}`. Элементы и группы объединяются по
стабильному kebab-case `id`, последующие поля перекрывают предыдущие; порядок
`layers` задаёт наследование между проектами. `{id, remove:true}` удаляет запись,
`enabled:false` скрывает её. В одном слое повторный id — ошибка. Три уровня
размещения: `row` (неотрицательное целое, меньше — выше), `side` (`left` /
`right`), `order` (меньше — раньше, при равенстве сохраняется порядок
регистрации). По умолчанию `row:0, side:'left', order:0`.

```js
const projectStatus = {
  groups: [{id:'scene', row:0, side:'left', order:20, separator:' · '}],
  items: [
    {id:'mode', group:'scene', order:10, text:({engine}) => engine.mode},
    {id:'object-name', group:'scene', order:20, text:({activeObject}) => activeObject?.name ?? 'Нет выбора'},
    {id:'help', row:1, side:'left', text:'Колесо — масштаб'},
  ],
};
const appStatus = {items:[{id:'fps', row:1, side:'right', order:10}]};
const removeExtra = status.addLayer({items:[{id:'extra',group:'scene',order:30,text:'Дополнительно'}]});
removeExtra();
```

Сгруппированные элементы следуют вместе; `order` группы задаёт место группы
в своей стороне строки, `order` элемента — место внутри. `row` и `side`
элемента, если заданы, переопределяют группу (элемент окажется в другом
фрагменте группы). Параметры `text`, `title`, `visible` принимают значение
или функцию от `{viewport, activeObject, fps, ...getContext()}`; `visible:false`
или пустой `text` скрывают элемент. Текст выводится безопасно, без HTML.
`getActiveObject` позволяет адаптировать выбор собственного приложения вместо
`viewport.activeObject`. Без `getWorldPosition` позиция не выдумывается.
Обновление на кадрах ограничено `interval` мс (по умолчанию 200), второй
анимационный цикл не создаётся; `dispose()` освобождает подписки и возвращает
исходное содержимое контейнера. Динамический `addLayer` возвращает функцию
отмены; слой, необходимый другим слоям, удалить нельзя до удаления зависимостей.

Чтобы перенести унаследованный элемент (например, `fps`) в группу с её
координатами, сбросьте унаследованное размещение: `{id:'fps', group:'scene',
row:null, side:null}`. Иначе явно заданные в базовом слое `row` и `side`
продолжают иметь приоритет над размещением группы.

### Параметры карты

Карта может экспортировать `settingsSchema` (массив `{key,label,type,default}`),
`getSettings()` и `updateSettings(partial)`. Поля `toggle`, `range` (также
`min`, `max`, `step`) и `select` (`options`) автоматически отображаются в
меню viewport3d «Отображение» во время действия карты и удаляются при её
смене. Значения сохраняются отдельно для каждой карты в localStorage; применение изменений остаётся у карты;
физические адаптеры зависят от хоста и этим интерфейсом не предоставляются.
Базовая сетка viewport3d имеет шаг один метр при метровых единицах сцены.

Хост может предоставить `createContext(base)` и `afterMount(ctx, module)`,
чтобы добавить в контекст карты адаптер физики. Карта регистрирует очистку
через `ctx.own`, а `environment.update(dt)` вызывает её `update`. Для
перестройки карты доступен `ctx.reload()`. Неподключённая физика не создаётся
автоматически: реальные тела остаются собственностью хоста.

Map settings callbacks receive the active viewport context as an optional argument: `getSettings(ctx)` and `updateSettings(partial, ctx)`. Map modules can use this context to keep each mounted map instance independent; existing callbacks that ignore the extra argument remain compatible.

### Studio host palette and focus (not user-facing)

Hosts may pass `environmentOptions.studioColors` with `background`, `pedestal`, and `grid: {major, minor}` colors. These are configuration, not map settings, and never appear in Display. Studio uses a one-metre bounded grid; outside it a half-metre grid fades with distance from `environmentOptions.getGridFocus()`. The callback may return a Three Object3D, a world-space `{x,z}` or `[x,y,z]`; without a subject the focus stays at the origin. Colours are shared by the map assets and work with the host's Three version.

### Surface, wireframe and skeleton

The common viewport header includes these three modes. By default they follow `viewport.activeObject` / `viewport.setActiveObject(object)`; hosts can provide `shadingOptions.getObject()` instead. Skeleton mode displays all model bones as Morphia-style coloured joint spheres and connecting lines, and is disabled when the selected object has no bones. The visual is supplied by `createViewportSkeleton({THREE, scene, root})`; call `update()` after animation, `setRoot()` on model changes, and `dispose()` on teardown. Extensions can pass `weight`, `selectedId`, `interactiveBones` and `colorOf` to update. It does not install pointer handlers or start its own render loop. Animio supplies cursor proximity and selection; Morphia reuses that Animio interaction. Wireframe materials are temporary clones and are restored and disposed on selection changes or teardown. A host with specialised skeleton interactions can pass `shadingOptions: false` to `mountViewportChrome` and handle the same header controls itself; Morphia does this for its interactive overlay.


### Host object selector slot
The shared viewport header provides `[data-v3d-object-host]` immediately before `[data-v3d-mode-host]`. It is empty and hidden when unused. A host may mount its active-object selector there; it owns the object list, import and lifecycle. The viewport does not create a second object state.

### Camera focus on the controlled character

`createViewportCharacterFocus` implements the shared editor camera policy without owning application characters. The host supplies `camera`, orbit `controls`, `getAnchor(out)` (world-space character midpoint), `isPreview()` and `isControlMode()`. Notify it via `selectionChanged()`, `previewChanged()` and `modeChanged()` after the corresponding host state changes, and call `update()` each editor frame. It translates camera and target together without changing the character or zoom. In control mode it follows the anchor and disables free panning; when `element` is supplied, right-drag adjusts only the world-vertical framing offset, which remains while the character moves. The previous pan setting is restored on exit/disposal. During gameplay it does not move the gameplay camera.

For the built-in scope, opt in with `viewport3d.characterFocus`: it defaults to the viewport's active object's world origin and mode id `character`; provide `getAnchor` for a body midpoint, `isPreview`, and `subscribePreview(callback)` returning an unsubscribe function to integrate a host's gameplay lifecycle. Selection and mode changes, render updates and disposal are wired by the scope. Projects with their own camera controls can use the same controller directly, as Morphia does. A host must supply its active character and gameplay state; a generic viewport cannot infer these from unrelated application state.
