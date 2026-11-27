# Ядро приложения

Идея та же, что в Yii2: **ядро** знает только жизненный цикл, а всё остальное
подключается **конфигурацией**. Ядро не импортирует движки, студии и персонажей;
они приходят модулями, которые приложение перечисляет в `config/`.

```js
import { createApplicationFrom } from "framework-preparatorio/core";

const app = await createApplicationFrom([
  import("./config/app.js"),      // id, bootstrap
  import("./config/modules.js"),  // modules: { evolvia: () => import("fws-evolvia/module"), ... }
  import("./config/params.js"),   // params: { physio: { gravity: -9.81 } }
], { env: "dev" });

await app.run((app) => { /* приложение запущено */ });
await app.dispose();
```

## Жизненный цикл

`created → init → bootstrap → run → dispose`; каждый шаг выполняется один раз.

| Шаг | Что происходит |
| --- | --- |
| `init` | читает паспорта, проверяет версию каркаса и совместимость модулей, строит порядок, регистрирует параметры и компоненты |
| `bootstrap` | запускает модули по порядку зависимостей, собирает области (если есть вклады), выполняет шаги `bootstrap` приложения |
| `dispose` | останавливает модули в обратном порядке, освобождает созданные компоненты |

Сбой `bootstrap` откатывает уже запущенные модули. События: `beforeInit`,
`afterInit`, `beforeBootstrap`, `module:bootstrapped`, `afterBootstrap`,
`beforeDispose`, `afterDispose` (`app.on(name, handler)`).

## Конфигурация

`mergeConfig` сливает объекты глубоко; массивы и функции заменяются целиком,
`null` сбрасывает значение. `loadConfig` принимает объект, функцию (получает
`{ env }`), `import()` или массив источников.

Приоритеты (от слабого к сильному):

- параметры: паспорт модуля → `params` приложения → `params` записи модуля;
- компоненты: паспорт модуля → `components` записи модуля → `components` приложения.

Запись модуля — паспорт, загрузчик (`() => import(...)`) или обёртка
`{ module, enabled, params, components }`. Ключ записи обязан совпадать с `id`.

## Паспорт модуля

```js
export default {
  id: "physio",
  version: "0.3.1",
  framework: ">=1.4.0",
  requires: { evolvia: "^1.1.0" },   // без них модуль не запустится
  optional: [],                      // учитываются в порядке, если включены
  params: { gravity: -9.81 },
  components: { "physio.session": { factory: async (deps, container) => ... } },
  scopes: { engines: [], pluginScopes: [], loaders: [], viewContributions: [] },
  async bootstrap(app) {},
  async dispose(app) {},
};
```

Паспорт — данные: при загрузке он ничего не импортирует, тяжёлое подключается
лениво в компонентах. Идентификаторы компонентов — `<id модуля>.<имя>`.

## Контейнер компонентов

Определение: функция-фабрика `(deps, container)`, класс, `{ factory, inject }`,
`{ class, config, inject }`, `{ value }`. Компонент — одиночка, пока не указано
`shared: false`; круговая зависимость называет цепочку. Фабрика может вернуть
`Promise`. При `dispose` приложения у созданных компонентов вызывается
`dispose()` или `destroy()`.

## Области

Вклады `scopes` всех модулей и раздел `scopes` приложения (`preferred`,
`engineOrder`, `builtInScopes`, `engines`, `pluginScopes`, `loaders`,
`mount`) собирает `app.scopes` теми же функциями, что и ручная сборка
(`registerScopeDefinitions`, `bindScopeImplementations`, `mountScopes`).
Если вкладов нет, области не трогаются.
