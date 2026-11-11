# Справочник API

Функции без пометки экспортируются из корня пакета (`framework-preparatorio`).
Функции с пометкой **браузер** требуют DOM и доступны из
`framework-preparatorio/menu`, `framework-preparatorio/shell` или
`framework-preparatorio/browser`.

- [Реестр областей](#реестр-областей)
  - [createScopeRegistry](#createscoperegistry)
  - [mountScopeNodes](#mountscopenodes)
  - [useScopeRegistry, getScopeRegistry](#usescoperegistry-getscoperegistry)
  - [getScope, listScopes, mountScopes](#getscope-listscopes-mountscopes)
  - [bindScopes](#bindscopes)
- [Доступность элементов управления](#доступность-элементов-управления)
  - [createScopeAvailability](#createscopeavailability)
- [Вклады меню](#вклады-меню)
  - [createMenuContributionRegistry](#createmenacontributionregistry)
  - [Готовые реестры «Вид» и «Просмотр»](#готовые-реестры-вид-и-просмотр)
  - [normalizeMenuContribution](#normalizemenacontribution)
- [Сборка приложения](#сборка-приложения)
  - [createScopeOrder](#createscopeorder)
  - [sortEngines](#sortengines)
  - [availablePluginScopes](#availablepluginscopes)
  - [registerScopeDefinitions](#registerscopedefinitions)
  - [registerContributions](#registercontributions)
  - [loadEnginePlugins](#loadengineplugins)
  - [bindScopeImplementations](#bindscopeimplementations)
- [Меню (браузер)](#меню-браузер)
- [Оболочка (браузер)](#оболочка-браузер)
- [Типы данных](#типы-данных)

## Реестр областей

### createScopeRegistry

```js
const registry = createScopeRegistry();
```

Создаёт независимый реестр областей. Реестр заморожен; состояние хранится
внутри замыкания.

| Метод | Параметры | Возвращает | Описание |
| --- | --- | --- | --- |
| `register` | `passport` | `passport` | Проверяет и регистрирует паспорт области |
| `bind` | `implementation` | `implementation` | Заменяет паспорт реализацией при совпадении полей |
| `get` | `id` | паспорт или `undefined` | Область по идентификатору |
| `list` | — | `object[]` | Все области в порядке регистрации |

**Проверки при `register`.** Исключение `Error` с текстом
`Invalid scope id`, `Invalid scope: <id>`, `Duplicate scope or area: <id>`,
`Invalid dependency in <id>`, `Duplicate or invalid tool in <id>: <toolId>`:

- `id` соответствует `/^[a-z][a-z0-9-]*$/` и уникален;
- заданы `areaId`, `selector`, `label` и строковый `template`;
- `areaId` и `selector` не используются другой областью;
- каждый элемент `dependencies` содержит `selector` и непустой `requires`;
- инструменты в `tools` имеют `id`, `nodeId`, `label` и уникальны в пределах
  реестра.

**Проверки при `bind`.** Исключение `Cannot bind unregistered or mismatched
scope: <id>`, если область не зарегистрирована или расходятся `areaId`,
`selector`, `template`, `tools`.

### mountScopeNodes

**браузер**

```js
mountScopeNodes(registry, root = document);
```

Заменяет каждый элемент `[data-scope-slot="<id>"]` содержимым `template`
соответствующей области и проставляет корневому узлу `data-scope="<id>"`.

- если слот не найден, узел добавляется в конец `#appRoot` (при
  `placement: "root"`) либо `main.b-main`;
- исключение `Duplicate slots for scope <id>`, если слот задан дважды;
- исключение `Invalid root in scope <id>`, если шаблон не даёт ровно один
  корневой элемент, соответствующий `selector`;
- исключение `No host for scope <id>`, если подходящего контейнера нет.

### useScopeRegistry, getScopeRegistry

```js
useScopeRegistry(registry);   // назначает текущий реестр
getScopeRegistry();           // возвращает текущий реестр
```

Оболочка обращается к реестру из нескольких независимых модулей; вместо
передачи реестра параметром он назначается один раз. Функция выбрасывает
`TypeError`, если передан пустой аргумент.

### getScope, listScopes, mountScopes

```js
getScope(id);        // область текущего реестра или null
listScopes();        // все области текущего реестра
mountScopes(root);   // mountScopeNodes для текущего реестра
```

### bindScopes

```js
const bound = await bindScopes(registry, loaders);
```

| Параметр | Тип | Описание |
| --- | --- | --- |
| `registry` | реестр | Целевой реестр |
| `loaders` | `(() => Promise<module>)[]` | Загрузчики модулей областей |

Модуль может экспортировать реализацию как `default` или как сам объект.
Модуль без зарегистрированного `id` пропускается без ошибки. Возвращает массив
идентификаторов связанных областей.

## Доступность элементов управления

### createScopeAvailability

```js
const availability = createScopeAvailability(["viewport"]);
```

| Метод | Параметры | Возвращает | Описание |
| --- | --- | --- | --- |
| `has` | `id` | `boolean` | Доступна ли область |
| `setAvailable` | `id`, `enabled` | — | Изменяет набор и пересчитывает привязки |
| `bind` | `node`, `requires` | `() => void` | Привязывает элемент управления; возвращает отвязку |
| `refresh` | — | — | Пересчитывает привязки без изменения набора |
| `onChange` | `listener` | `() => void` | Подписка на `{ id, available }`; возвращает отписку |

Пока требуемая область отсутствует, элемент получает:

- `disabled = true`;
- `aria-disabled="true"`;
- `title="Недоступно: <id1, id2>"`.

При появлении области восстанавливаются прежние `disabled`, `aria-disabled` и
`title`. Исключения: `Expected a disableable control` (у элемента нет свойства
`disabled`), `Expected scope dependencies` (пустой или некорректный `requires`).

## Вклады меню

### createMenuContributionRegistry

```js
const registry = createMenuContributionRegistry("view");
```

| Метод | Параметры | Возвращает | Описание |
| --- | --- | --- | --- |
| `register` | `contribution`, `owner?` | `() => boolean` | Регистрирует вклад; функция снимает его |
| `list` | — | `object[]` | Отсортировано по `order`, затем по `id` |
| `get` | `id` | вклад или `undefined` | Вклад по идентификатору |
| `subscribe` | `listener` | `() => void` | События `{ type: "register" \| "unregister", contribution }` |

Исключения: `Menu contribution group must be a valid id`,
`<Group> contribution requires a valid id, label and selector`,
`Duplicate <Group> contribution: <id>`.

`createViewContributionRegistry()` и `createViewportContributionRegistry()` —
то же самое для групп `view` и `viewport`. При изменении реестра в браузере
генерируется событие `ui:view-contributions-changed` или
`ui:viewport-contributions-changed` на `window`.

### Готовые реестры «Вид» и «Просмотр»

```js
registerViewContribution(contribution, owner);   // () => boolean
listViewContributions();                          // object[]
getViewContribution(id);                          // вклад или null
subscribeViewContributions(listener);             // () => void

registerViewportContribution(contribution, owner);
listViewportContributions();
getViewportContribution(id);
subscribeViewportContributions(listener);
```

### normalizeMenuContribution

```js
normalizeMenuContribution(input, group = "view", owner = "plugin");
normalizeViewContribution(input, owner = "plugin");
```

Возвращает замороженный объект
`{ id, group, label, description, selector, owner, requires, order }`.
Значения по умолчанию: `description: ""`, `requires: []`, `order: 1000`.

## Сборка приложения

### createScopeOrder

```js
const { rank, compare } = createScopeOrder(["outliner", "viewport"]);
```

`rank(scope)` равен `scope.order`, если поле задано, иначе индексу в
`preferred`, иначе `1000`. `compare` сортирует по `rank`, затем по `id`.
Исключение `TypeError`, если `preferred` — не массив.

### sortEngines

```js
const engines = sortEngines(discoveredEngines, ["shl", "locomotion"]);
```

Движки из `engineOrder` идут первыми в указанном порядке, остальные — по
алфавиту `id`. Исключение `Дубликат id движка` при повторяющемся `id`,
`TypeError` при не-массиве.

### availablePluginScopes

```js
const scopes = availablePluginScopes(pluginScopes, engines);
```

Возвращает области, у которых все `requiresEngines` присутствуют среди
движков. Область без `requiresEngines` проходит всегда.

### registerScopeDefinitions

```js
registerScopeDefinitions(registry, {
  engines,            // уже отсортированные движки
  pluginScopes,       // паспорта областей плагинов
  preferred,          // порядок областей
  engineOrder,        // порядок движков (если engines не отсортированы)
});
// → { engines, scopes }
```

Регистрирует области плагинов, затем области движков
(`plugins.scopeDefinitions` или `scopeDefinitions`). Каждая группа
сортируется по `preferred`. Отфильтрованные по `requiresEngines` области
плагинов не регистрируются.

### registerContributions

```js
const ids = registerContributions(engines, registry.list());
```

Раскладывает `viewContributions` и `viewportContributions` движков и областей
в соответствующие реестры. Возвращает массив идентификаторов зарегистрированных
вкладов.

### loadEnginePlugins

```js
const loaded = await loadEnginePlugins(engines);
```

Вызывает по очереди все `plugins.loaders` движков. Возвращает массив
идентификаторов движков, у которых были загрузчики.

### bindScopeImplementations

```js
const bound = await bindScopeImplementations(registry, { engines, loaders });
```

1. Связывает области плагинов через `loaders` (загрузчики приложения).
2. Связывает области движков: для `kind: "scope"` вызывается `engine.load()`.

Модуль без зарегистрированного `id` пропускается. Возвращает идентификаторы
связанных областей в порядке связывания.

## Меню (браузер)

### initMenuContributions

```js
const menu = initMenuContributions({
  root = document,
  hostSelector,     // контейнер меню
  list,             // () => contributions
  eventName,        // событие обновления реестра
  classPrefix,      // префикс классов и data-атрибутов
});
```

Переносит узел, найденный по `selector` вклада, в `hostSelector` и оборачивает
его в `<section class="menu-contribution …">` с заголовком `label`. Порядок
задаётся через `style.order`. При снятии вклада узел возвращается на исходное
место. Пересборка выполняется по `MutationObserver` и по событию `eventName`.

Возвращает `{ sync, dispose }`. Исключения: `TypeError` при отсутствии
`hostSelector`, `list`, `eventName` или `classPrefix`. Если контейнер не найден,
возвращается пустой контроллер.

### initViewMenu, initViewportMenu

```js
initViewMenu({ root = document, hostSelector = "#viewMenuContributions" });
initViewportMenu({ root = document, hostSelector = "#viewportHeaderMenuContributions" });
```

Готовые обёртки над `initMenuContributions` для реестров «Вид» и «Просмотр».

## Оболочка (браузер)

### initCollapsibleSections

```js
initCollapsibleSections({ root = document, state = null, persist = () => {}, scope = "viewport" });
```

Включает сворачивание секций из `uix-preparatorio`. Состояние хранится в
`state[scope].sections`; после изменения вызывается `persist`.

### installVirtualDockSizing, installCompactDockSizing

```js
installVirtualDockSizing(dock, widgets, {
  storageKey = "preparatorio.shell.expanded-tab-heights.v1",
  collapseEvent = "ui:collapse-changed",
  resetEvent = "ui:layout-reset",
  legacyHeight,
});
installCompactDockSizing(dock, widgets);
```

Высоты раскрытых вкладок и компактная раскладка. Приложение может передать
собственные ключи хранения и имена событий.

### createToolCatalogue

```js
const { tools, byId, byScope } = createToolCatalogue(registry, { order });
```

Собирает инструменты всех областей реестра. Каждый инструмент дополняется
полем `scope`. Каталог строится в момент вызова, что позволяет учитывать
области, зарегистрированные позже. Исключение `TypeError`, если аргумент не
похож на реестр (`list()` отсутствует).

## Типы данных

### Паспорт области

```ts
{
  kind?: "scope",
  id: string,
  areaId: string,
  selector: string,
  label: string,
  template: string,
  hideable?: boolean,
  placement?: "root",
  dependencies?: { selector: string, requires: string[] }[],
  tools?: { id: string, nodeId: string, label: string, order?: number, rail?: boolean }[],
  requiresEngines?: string[],
  viewContributions?: Contribution[],
  viewportContributions?: Contribution[],
}
```

### Реализация области

```ts
{ ...паспорт, [метод: string]: Function }
```

Обязательных методов нет: состав определяется приложением
(`init`, `initController`, `activate` и т. п.).

### Вклад меню

```ts
{
  id: string,            // kebab-case, уникален в реестре
  label: string,
  selector: string,      // узел, который переносится в меню
  description?: string,
  requires?: string[],   // области, без которых вклад неактуален
  order?: number,        // по умолчанию 1000
}
```

### Движок

```ts
{
  id: string,
  kind?: "scope",                        // движок, приносящий область
  plugins?: {
    scopeDefinitions?: ScopePassport[],
    loaders?: (() => Promise<unknown>)[],
    viewContributions?: Contribution[],
    viewportContributions?: Contribution[],
  },
  load: () => Promise<module>,           // реализация
}
```
