/**
 * Сборка интерфейса из вкладов модулей.
 *
 * Тонкая прослойка между ядром приложения и существующими правилами областей
 * (`composition/`, `scopes/`): модули приносят паспорта движков и областей,
 * приложение — порядок и встроенные области, а сама регистрация, связывание с
 * реализациями и монтирование остаются теми же функциями каркаса. Поэтому
 * приложения, собранные вручную через `registerScopeDefinitions`, продолжают
 * работать без изменений.
 */
import { createScopeRegistry, mountScopeNodes } from "../studio/scopes/registry.js";
import { useScopeRegistry } from "../studio/scopes/index.js";
import {
  registerScopeDefinitions,
  registerContributions,
  loadEnginePlugins,
  bindScopeImplementations,
} from "../app/composition/register.js";

const ARRAY_FIELDS = ["engines", "pluginScopes", "loaders", "viewContributions", "viewportContributions"];

/** Есть ли что собирать: вклады модулей или настройки приложения. */
export function hasScopeContributions(modules = [], config = {}) {
  if (ARRAY_FIELDS.some((field) => (config[field] ?? []).length)) return true;
  if (config.builtInScopes && Object.keys(config.builtInScopes).length) return true;
  return modules.some((module) => ARRAY_FIELDS.some((field) => (module.scopes?.[field] ?? []).length));
}

/**
 * @param {{modules: object[], config?: object, registry?: object}} options
 *   `modules` — паспорта в порядке запуска; `config` — раздел `scopes`
 *   конфигурации приложения: `preferred`, `engineOrder`, `builtInScopes`,
 *   а также собственные `engines`, `pluginScopes`, `loaders`.
 */
export function createScopeComposer({ modules = [], config = {}, registry = createScopeRegistry() } = {}) {
  const collect = (field) => [
    ...modules.flatMap((module) => module.scopes?.[field] ?? []),
    ...(config[field] ?? []),
  ];
  const engines = collect("engines");
  let composed = false;
  let bound = [];

  return Object.freeze({
    registry,
    /** Зарегистрировать паспорта и вклады меню. Повторный вызов запрещён. */
    compose() {
      if (composed) throw new Error("Области уже собраны");
      composed = true;
      const result = registerScopeDefinitions(registry, {
        engines,
        pluginScopes: collect("pluginScopes"),
        preferred: config.preferred ?? [],
        engineOrder: config.engineOrder ?? [],
        builtInScopes: config.builtInScopes ?? {},
      });
      if (config.current !== false) useScopeRegistry(registry);
      if (config.contributions !== false) {
        const owners = modules.map((module) => ({
          id: module.id,
          viewContributions: module.scopes?.viewContributions ?? [],
          viewportContributions: module.scopes?.viewportContributions ?? [],
        }));
        registerContributions([...result.engines, ...owners, ...(config.viewContributions || config.viewportContributions
          ? [{ id: "app", viewContributions: config.viewContributions ?? [], viewportContributions: config.viewportContributions ?? [] }]
          : [])], registry.list());
      }
      return result;
    },
    /** Загрузить плагины движков и связать паспорта с реализациями. */
    async bind() {
      if (!composed) throw new Error("Сначала compose()");
      await loadEnginePlugins(engines);
      bound = await bindScopeImplementations(registry, { engines, loaders: collect("loaders") });
      return bound;
    },
    /** Заменить слоты разметки корнями областей (нужен DOM). */
    mount(root = globalThis.document, options) {
      if (!composed) throw new Error("Сначала compose()");
      if (!root) throw new Error("mount: нет документа");
      mountScopeNodes(registry, root, options);
    },
    get composed() {
      return composed;
    },
    get bound() {
      return [...bound];
    },
  });
}
