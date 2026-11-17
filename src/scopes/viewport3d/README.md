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

Для размера контейнера задайте CSS в приложении. Передайте `loop: false`, если кадр управляется снаружи, или `loop: (viewport, time) => { /* обновление и render */ }`. При ошибке запуска ресурсы очищаются. Возвращённая функция имеет свойство `viewport3d`.

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

## Расширения и владение

`requires.scopes`, `requires.apis`, `requires.plugins` — необязательные массивы. Плагин с отсутствующей зависимостью ожидает её появления. `registerPlugin`, `registerPlugins`, `unregisterPlugin`, `getPlugin`, `listPlugins`, `setScopeAvailable` и `setApi` управляют расширениями. При потере зависимости сначала останавливаются зависимые расширения; при восстановлении они включаются снова. Дубликаты и циклы отклоняются.

`activate({viewport, scopes, apis, signal, defer})` вызывается синхронно. Зависимости читаются через `scopes.has(id)`, `apis` и `viewport.getPlugin(id)`. На очистку `signal` отменяется, а `defer` вызывается в обратном порядке, в том числе при исключении. Для асинхронной работы следите за `signal`, чтобы не оставлять ресурсы после отключения.

Если `renderer` или `canvas` передан извне, он остаётся собственностью хоста; `ownRenderer: true` передаёт владение рендерером области. Область не освобождает чужие геометрию, материалы и текстуры: создавший их плагин регистрирует очистку через `defer`. `dispose()` идемпотентен. `start` поддерживает `raf` и `renderer`, но одновременно работает только один цикл; внешний цикл может вызывать `render()` напрямую. `onResize`, `observeResize`, `disconnectResize`, `ignoreZeroSize`, `configure` и `retryWithoutAntialias` дают хосту контроль размеров и параметров.

## Проверки

Из корня пакета: `npm test`. Тесты проверяют включение, исключение, пользовательский паспорт, жизненный цикл, владение рендерером и разрешение зависимостей расширений.
