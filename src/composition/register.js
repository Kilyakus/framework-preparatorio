/**
 * Сборка приложения из паспортов.
 *
 * Последовательность:
 *   1. движки — из своих `registry.js`;
 *   2. области плагинов — только при наличии движков из `requiresEngines`;
 *   3. области движков — из `plugins.scopeDefinitions`;
 *   4. вклады меню — от движков и от областей;
 *   5. реализации — по требованию (`load()` движка или загрузчик плагина).
 *
 * Пятый шаг — единственное место, где загружаются тяжёлые модули: до него в
 * памяти находятся только паспорта.
 */
import { createScopeOrder } from "./order.js";
import {
  registerViewContribution,
  registerViewportContribution,
} from "../contributions/view-contributions.js";

const contributionsOf = (owner) => owner?.plugins ?? owner ?? {};

/** Движки в стабильном порядке: служебные сначала, остальные по алфавиту. */
export function sortEngines(engines, order = []) {
  if (!Array.isArray(engines)) throw new TypeError("sortEngines: нужен массив движков");
  const rank = (id) => (order.includes(id) ? order.indexOf(id) : order.length);
  const sorted = [...engines].sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  if (new Set(sorted.map((engine) => engine.id)).size !== sorted.length) {
    throw new Error("Дубликат id движка");
  }
  return sorted;
}

/** Области плагинов, у которых есть все нужные движки. */
export function availablePluginScopes(pluginScopes, engines) {
  const ids = new Set(engines.map((engine) => engine.id));
  return [...pluginScopes].filter((scope) => (scope.requiresEngines ?? []).every((id) => ids.has(id)));
}

/**
 * Зарегистрировать паспорта: сначала области плагинов, затем области движков.
 *
 * `preferred` — порядок областей, `engineOrder` — порядок движков.
 *
 * @returns {{engines: object[], scopes: object[]}}
 */
export function registerScopeDefinitions(registry, { engines = [], pluginScopes = [], preferred = [], engineOrder = [] } = {}) {
  if (!registry || typeof registry.register !== "function") throw new TypeError("registerScopeDefinitions: нужен реестр областей");
  const sorted = sortEngines(engines, engineOrder);
  const order = createScopeOrder(preferred);
  for (const scope of availablePluginScopes(pluginScopes, sorted).sort(order.compare)) registry.register(scope);
  for (const engine of sorted) {
    const definitions = contributionsOf(engine).scopeDefinitions ?? engine.scopeDefinitions ?? [];
    for (const scope of [...definitions].sort(order.compare)) registry.register(scope);
  }
  return { engines: sorted, scopes: registry.list() };
}

/** Вклады меню: движки отдают свои, области — свои. */
export function registerContributions(engines = [], scopes = []) {
  const registered = [];
  const owner = (item, id) => {
    for (const contribution of contributionsOf(item).viewContributions ?? item.viewContributions ?? []) {
      registerViewContribution(contribution, id);
      registered.push(contribution.id);
    }
    for (const contribution of contributionsOf(item).viewportContributions ?? item.viewportContributions ?? []) {
      registerViewportContribution(contribution, id);
      registered.push(contribution.id);
    }
  };
  for (const engine of engines) owner(engine, engine.id);
  for (const scope of scopes) owner(scope, scope.id);
  return registered;
}

/** Плагины самих движков: вызываются до построения окна. */
export async function loadEnginePlugins(engines = []) {
  const loaded = [];
  for (const engine of engines) {
    for (const load of contributionsOf(engine).loaders ?? []) {
      await load();
      loaded.push(engine.id);
    }
  }
  return loaded;
}

/**
 * Связать паспорта с реализациями.
 *
 * `loaders` — загрузчики областей плагинов (их собирает приложение своим
 * `import.meta.glob`). Области-движки грузятся своим `load()`.
 */
export async function bindScopeImplementations(registry, { engines = [], loaders = [] } = {}) {
  const bound = [];
  for (const load of loaders) {
    if (typeof load !== "function") continue;
    const module = await load();
    const scope = module?.default ?? module;
    if (!scope?.id || !registry.get(scope.id)) continue;
    registry.bind(scope);
    bound.push(scope.id);
  }
  for (const engine of engines) {
    if (engine.kind !== "scope" || typeof engine.load !== "function") continue;
    const module = await engine.load();
    const scope = module?.default ?? module;
    if (!scope?.id || !registry.get(scope.id)) continue;
    registry.bind(scope);
    bound.push(scope.id);
  }
  return bound;
}
