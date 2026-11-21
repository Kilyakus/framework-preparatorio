# Общая графика viewport3d

## Автоматические тени

`shadow: 'auto'` использует `ViewportDynamicShadowQuality` для каждого источника с `castShadow`. Алгоритм оценивает потребность по размеру теневого объёма, дистанции до цели света и высоте экрана (если цель неизвестна — по высоте экрана), ограничивает карту аппаратными возможностями, уменьшает её при устойчивой нагрузке и постепенно повышает после восстановления производительности. Для точечных источников дополнительно учитывается атлас карты. Оценка частоты — по интервалам кадров, а не GPU timer; это эвристика, а не гарантия FPS. `shadow: '512'…'8192'` — фиксированный размер с учётом лимита устройства, `off` отключает тени.

При наличии собственного `shadowAdapter` управление остаётся у него: оно может отражать знания сцены. Для совместимости Morphia использует подкласс общего `ViewportDynamicShadowQuality`, включая свой расчёт bias и границу для мира. Хост при необходимости может передать свой target/controls, min/max и правила смещения; общий контроллер по умолчанию не меняет bias хостовых источников. Не следует одновременно запускать два авто-контроллера на одном источнике.

## AO (постобработка Rephlexia)

AO по умолчанию выключен, как и участие персонажей и динамических объектов. Статическая геометрия участвует при включённом AO. Используются проходы GTAO + фильтрация и маска по глубине полного кадра: исключённый объект не создаёт и не получает AO, а AO карты не рисуется поверх него. Прозрачные материалы без записи глубины, линии, точки и спрайты исключаются. Скиннованные меши без метки считаются персонажами. Маска основана на буфере глубины; прозрачность и эффекты без записи глубины требуют дополнительной проверки конкретной сцены.

Framework не импортирует собственный `three`: приложение должно передать addons **из того же экземпляра и версии Three.js**, что используются его сценой и рендерером:

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createViewportGraphics, setViewportAoCategory } from 'framework-preparatorio/scopes/viewport3d';

setViewportAoCategory(characterRoot, 'character'); // игрок, NPC, включая одежду/волосы в дочерних узлах
setViewportAoCategory(movingPropRoot, 'dynamic');
const graphics = createViewportGraphics(viewport, {
  aoOptions: {
    addons: { EffectComposer, RenderPass, GTAOPass, OutputPass },
    getUnitsPerMeter: () => 1, // реальный масштаб конкретного мира
  },
});
```

Для `mountViewportChrome` и `activateViewport3DScope` те же опции передаются через `graphicsOptions.aoOptions`. `viewport.render()` обязателен: прямой `renderer.render()` обходит postprocessing и hooks. Проход устанавливается как единственный render pipeline viewport; при наличии другого pipeline нужна согласованная композиция, а не два владельца. После отключения эффекта рендер прямой; `graphics.dispose()` снимает pipeline и освобождает собственные GPU-ресурсы. `setViewportAoCategory(root, null)` снимает метку. `static` принудительно относит узел к статике; `exclude` и старый `userData.excludeFromAO` всегда исключают узел. Явная метка на дочернем узле приоритетнее классификации предка. Хост может передать `classify(object)` для немодифицируемых моделей.

Текущий патч использует внутренности GTAOPass, поэтому включён только для WebGL2 и проверенных Three.js r186/r187 с перспективной камерой. Без переданных addons или в неподдерживаемой конфигурации интерфейс показывает, что AO недоступен. Новые версии Three.js следует проверить до включения. В Morphia миры созданы в метрах. У других хостов `getUnitsPerMeter` и разметка категорий должны соответствовать их сцене: движущийся объект нельзя надёжно угадать по Three.js-мешу.
