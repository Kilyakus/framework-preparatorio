# viewport3d — необязательная базовая область

Область и общий runtime расположены в `framework-preparatorio/scopes/viewport3d`. По умолчанию встроенная область **не регистрируется, не монтируется и не создаёт WebGL-контекст**. Приложение явно включает её конфигурацией при сборке. Собственных копий Three.js нет: хост передаёт используемый им `THREE`.

## Включение области

```js
import * as THREE from 'three';
import {createScopeRegistry, registerScopeDefinitions, mountScopeNodes} from 'framework-preparatorio';

const registry = createScopeRegistry();
registerScopeDefinitions(registry, {
  builtInScopes: {viewport3d: {enabled: true}},
});
mountScopeNodes(registry, document);
const node = document.querySelector('[data-viewport3d-scope]');
const dispose = registry.get('viewport3d').activate({
  node,
  viewport3d: {THREE, plugins: [], onReady(viewport) {
    viewport.camera.position.z = 4;
  }},
});
// Позже: dispose();
```

Импортируйте CSS и задайте размер контейнера в приложении:

```js
import 'framework-preparatorio/scopes/viewport3d/styles.css';
```

Встроенная область содержит шапку «3D Просмотр», базовый режим «Просмотр»,
инструмент «Обзор», управление камерой и панель «Графика». При `loop: false`
изменения навигации, графики и размера запрашивают одиночный кадр; либо передайте
`loop: (viewport, time) => { /* обновление и viewport.render() */ }`. При
ошибке запуска ресурсы очищаются. Возвращённая функция имеет свойства
`viewport3d`, `modes`, `graphics`, `orbit`. Управление объектами и выбор
персонажа в каркас не встроены: их добавляет приложение.

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
дают готовые слоты, `mountViewportChrome({root, viewport, modeOptions,
graphicsOptions})` их заполняет. Панель графики переносится в `document.body`,
чтобы не обрезаться границами дока; она прокручивается и закрывается по Escape
или нажатию снаружи. `chrome.dispose()` возвращает узел на место и снимает
обработчики; `viewport.dispose()` вызывает эту очистку автоматически.

`createViewportModes` не зависит от DOM. Единственный встроенный режим —
`view` («Просмотр») с единственным инструментом `orbit` («Обзор»). Дескрипторы
приложения передаются массивами `tools` и `modes` либо добавляются методами
`registerTool`/`registerMode`. У режима указываются `id`, `label`, `tools`,
`defaultTool`, при необходимости `description` и `available`. Состояние
`modes.value` и `subscribe` содержат выбранные режим и инструмент; каждый
режим помнит свой последний инструмент в течение сеанса. `setMode`, `setTool`,
`setAvailable` и `removeMode` проверяют доступность; базовый `view` нельзя
удалить или выключить. `onModeChange`/`onToolChange` могут вернуть `false`,
чтобы отклонить переход. Для отдельной разметки есть `mountViewportModes`.
Сохранение выбора и реальные действия инструментов остаются у хоста.

Если у приложения уже есть управление камерой, используйте его; иначе
`createViewportOrbit(viewport, {target, onChange, isEnabled})` предоставляет
вращение, перемещение, масштаб, клавиатуру и жесты для перспективной и
ортографической камеры. `isEnabled()` может приостановить обработку ввода;
встроенная область делает это, когда активен не `orbit`. Вызывайте `dispose()`
при размонтировании. Приложение вправе сохранить свои жесты, например вращение
модели вместо вращения камеры.

## Настройки графики

`createViewportGraphics(viewport, options)` управляет **реальным** рендерером:

- масштабом и пределом плотности экрана, опциональным адаптивным разрешением;
- экспозицией, тональным отображением и пространством вывода;
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

Если хост сам управляет динамическим качеством теней, передайте `shadowAdapter`
с `setQuality(size|null)`, `snapshot()`, опциональными `minSize` и
`resetAdjust()`. Для временно скрытых исходных материалов передайте
`additionalMaterials: () => iterable`: при смене теней/тона обновятся и они.
`mountViewportGraphics({host, graphics})` встраивает те же поля в свой контейнер;
`legacyIds: true` оставляет ID старых контролов Morphia. Контроллер не владеет
геометрией, светом или материалами: `dispose()` снимает подписки и возвращает
переопределённую анизотропию, но не уничтожает сцену и не откатывает настройки
рендерера. Ресурсами по-прежнему управляет создавший их хост.

## Расширения и владение

`requires.scopes`, `requires.apis`, `requires.plugins` — необязательные массивы. Плагин с отсутствующей зависимостью ожидает её появления. `registerPlugin`, `registerPlugins`, `unregisterPlugin`, `getPlugin`, `listPlugins`, `setScopeAvailable` и `setApi` управляют расширениями. При потере зависимости сначала останавливаются зависимые расширения; при восстановлении они включаются снова. Дубликаты и циклы отклоняются.

`activate({viewport, scopes, apis, signal, defer})` вызывается синхронно. Зависимости читаются через `scopes.has(id)`, `apis` и `viewport.getPlugin(id)`. На очистку `signal` отменяется, а `defer` вызывается в обратном порядке, в том числе при исключении. Для асинхронной работы следите за `signal`, чтобы не оставлять ресурсы после отключения.

Если `renderer` или `canvas` передан извне, он остаётся собственностью хоста; `ownRenderer: true` передаёт владение рендерером области. Область не освобождает чужие геометрию, материалы и текстуры: создавший их плагин регистрирует очистку через `defer`. `dispose()` идемпотентен. `start` поддерживает `raf` и `renderer`, но одновременно работает только один цикл; внешний цикл может вызывать `render()` напрямую. `onResize`, `observeResize`, `disconnectResize`, `ignoreZeroSize`, `configure` и `retryWithoutAntialias` дают хосту контроль размеров и параметров.

## Проверки

Из корня пакета: `npm test`. Тесты проверяют включение, исключение, пользовательский паспорт, жизненный цикл, владение рендерером и разрешение зависимостей расширений.
