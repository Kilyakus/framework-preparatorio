# История изменений

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование — [Semantic Versioning](https://semver.org/lang/ru/).

## [1.0.0] — 2026-11-11

Первый выпуск. Каркас выделен из Morphia Studio 2.0.139 в самостоятельный
пакет; логика перенесена без изменений.

### Добавлено

- **`scopes/`** — реестр паспортов областей, связывание паспорта с
  реализацией, монтирование слотов `[data-scope-slot]`, управление
  доступностью элементов управления.
- **`contributions/`** — реестры пунктов меню «Вид» и «меню области», события
  `ui:view-contributions-changed` и `ui:viewport-contributions-changed`.
- **`composition/`** — правила сборки: порядок движков (`sortEngines`) и
  областей (`createScopeOrder`), регистрация паспортов
  (`registerScopeDefinitions`), отбор областей по `requiresEngines`
  (`availablePluginScopes`), раскладка вкладов (`registerContributions`),
  загрузка плагинов движков (`loadEnginePlugins`) и связывание реализаций
  (`bindScopeImplementations`).
- **`menu/`** — перенос узлов-вкладов в контейнер меню, готовые обёртки для
  меню «Вид» и меню области.
- **`shell/`** — обёртки над `uix-preparatorio`: сворачивание секций, высоты
  раскрытых вкладок, компактная раскладка; каталог инструментов
  (`createToolCatalogue`).
- Подпутя экспорта: `/browser`, `/scopes`, `/contributions`, `/composition`,
  `/menu`, `/shell`.
- Модульные тесты на `node:test` (21 проверка) и конфигурация CI.
- Справочник API (`docs/API.md`) и иллюстрация интерфейса
  (`docs/images/demo.png`).

### Изменено по сравнению с копией в приложении

- `createScopeRegistry().bind` сравнивает `tools` и `template` по значению, а
  не по ссылке: реализация может быть собрана расширением паспорта
  (`{ ...passport, init }`).
- `createToolCatalogue` строит каталог инструментов при вызове, а не при
  импорте модуля, поэтому учитывает области, зарегистрированные позже.

### Совместимость

- Node.js ≥ 20, ES-модули.
- `uix-preparatorio` — зависимость для подпутей `/menu`, `/shell`, `/browser`.
- Проверено на Morphia Studio 2.0.139: сборка, `check:core`, `check:content`
  и запуск интерфейса проходят без изменений в поведении.
