/**
 * Загрузка областей в браузере.
 *
 * Каркас не обходит файловую систему: каталог областей отдаёт хост приложения
 * одним JSON-ответом (`GET /api/scopes` по умолчанию). Ответ содержит пути
 * модулей, их ревизию и, если хост умеет, готовые паспорта. Загрузчик:
 *
 *   1. приводит области к порядку приложения (`preferred`) и полю `order`;
 *   2. регистрирует паспорта в реестре областей;
 *   3. переносит разметку в слоты каркаса (`mountScopes`);
 *   4. активирует реализации (`activateScopes`) и возвращает функции очистки;
 *   5. собирает производные каталоги: инструменты, меню тулбара, темы справки.
 *
 * Протокол хоста — часть каркаса, поэтому приложение не дублирует ни ретраи
 * динамических импортов, ни версионирование URL: оно передаёт только endpoint,
 * порядок областей и селекторы контейнеров.
 */
import { createScopeRegistry, mountScopeNodes } from "../scopes/index.js";
import { collectTopbarMenus, toMenuSpec, helpMenuSpec } from "../topbar/index.js";
import { collectHelpTopics } from "../help/index.js";

const dynamicImport = (url) => import(url);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function appendQuery(url, key, value) {
  const hashAt = url.indexOf("#");
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
}

/** URL корневого модуля области, привязанный к ревизии файлов на диске. */
export function versionedModuleUrl(url, revision) {
  const stamp = Number.isFinite(revision) ? Math.trunc(revision) : "current";
  return appendQuery(url, "scope-revision", stamp);
}

/**
 * Импорт модуля области с одним повтором по свежему URL.
 *
 * Повтор защищает уже открытые страницы предпросмотра, пока хост-процесс
 * перезапускается: первый импорт может попасть в смену процесса, второй —
 * в уже поднятый.
 */
export async function importScopeUrl(url, {
  importer = dynamicImport,
  now = Date.now,
  wait = pause,
} = {}) {
  try {
    return await importer(url);
  } catch (firstError) {
    try {
      await wait(150);
      return await importer(appendQuery(url, "scope-retry", now()));
    } catch (error) {
      if (error instanceof Error && !("cause" in error)) {
        try { Object.defineProperty(error, "cause", { value: firstError, configurable: true }); } catch {}
      }
      throw error;
    }
  }
}

/**
 * Загрузчик областей приложения.
 *
 * @param {object} [options]
 * @param {string} [options.endpoint="/api/scopes"] каталог областей у хоста
 * @param {string[]} [options.preferred=[]] порядок id областей
 * @param {string} [options.host] селекторы контейнера панелей
 * @param {string} [options.rootHost] селекторы контейнера областей уровня root
 * @param {typeof fetch} [options.fetch] подмена загрузчика (тесты)
 */
export function createScopeLoader({
  endpoint = "/api/scopes",
  preferred = [],
  host,
  rootHost,
  fetch: fetchImpl = (...args) => fetch(...args),
} = {}) {
  const rank = (scope) => {
    const index = preferred.indexOf(scope.id);
    return index === -1 ? preferred.length : index;
  };
  const orderOf = (scope) => (typeof scope.order === "number" ? scope.order : 10000);
  const sortScopes = (scopes = []) => [...scopes]
    .sort((a, b) => orderOf(a) - orderOf(b) || rank(a) - rank(b) || String(a.id).localeCompare(String(b.id)));

  let registry = createScopeRegistry();
  let loaded = null;

  const mountOptions = () => ({
    ...(host ? { host } : {}),
    ...(rootHost ? { rootHost } : {}),
  });

  /** Находит и регистрирует области. Повторные вызовы отдают тот же результат. */
  function loadScopes() {
    if (loaded) return loaded;
    loaded = (async () => {
      const response = await fetchImpl(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`Не удалось получить список областей: ${response.status}`);
      const { scopes = [] } = await response.json();
      const next = createScopeRegistry();
      const definitions = await Promise.all(scopes.map(async (item) => {
        // Хост может прислать готовый паспорт; иначе берём модуль области.
        const definition = item.definition
          ?? (await importScopeModule(item, "registry"));
        return {
          ...definition,
          engineId: item.engineId ?? null,
          entryUrl: item.hasEntry ? versionedModuleUrl(item.entry, item.revision) : null,
        };
      }));
      for (const scope of sortScopes(definitions)) next.register(scope);
      registry = next;
      return registry;
    })().catch((error) => {
      loaded = null;
      throw error;
    });
    return loaded;
  }

  function importScopeModule(item, field, options) {
    return importScopeUrl(versionedModuleUrl(item[field], item.revision), options);
  }

  const listScopes = () => registry.list();
  const getScope = (id) => registry.get(id);

  /** Инструменты — вклад областей, а не отдельный жёсткий список. */
  const listTools = () => Object.freeze(listScopes()
    .flatMap((scope) => (scope.tools ?? []).map((tool) => ({ ...tool, scopeId: scope.id, areaId: scope.areaId })))
    .sort((a, b) => (a.order ?? 10000) - (b.order ?? 10000)));

  const contributions = (key) => Object.freeze(listScopes()
    .flatMap((scope) => (scope[key] ?? []).map((item) => ({ ...item, scopeId: scope.id })))
    .sort((a, b) => (a.order ?? 10000) - (b.order ?? 10000)));

  /** Разделы меню самой области (например, настройки отображения вьюпорта). */
  const listViewportContributions = () => contributions("viewportContributions");

  /** Загружает области и переносит их разметку в слоты каркаса. */
  async function mountScopes(options = {}) {
    const scopeRegistry = await loadScopes();
    mountScopeNodes(scopeRegistry, options.root ?? document, { ...mountOptions(), ...options });
    return scopeRegistry;
  }

  /**
   * Активирует области после сборки каркаса: у каждой уже есть свой узел в доке.
   * `activate(context)` возвращает функцию очистки. Области без реализации
   * (только разметка и метаданные) пропускаются.
   */
  async function activateScopes(context = {}) {
    const cleanups = new Map();
    for (const scope of listScopes()) {
      if (!scope.entryUrl) continue;
      const node = document.querySelector(scope.selector);
      if (!node) continue;
      try {
        const module = await importScopeUrl(scope.entryUrl);
        const dispose = await module.default?.activate?.({ ...context, scope, node });
        if (typeof dispose === "function") cleanups.set(scope.id, dispose);
      } catch (error) {
        // Одна область не должна ронять весь интерфейс: она остаётся видимой,
        // но её собственная логика не запустилась — об этом говорит журнал.
        console.error(`[scopes] Область «${scope.id}» не активировалась:`, error);
      }
    }
    return () => {
      for (const dispose of cleanups.values()) {
        try { dispose(); } catch (error) { console.error("[scopes] Ошибка очистки области:", error); }
      }
      cleanups.clear();
    };
  }

  /** Меню тулбара — производное от областей, статичных пунктов в каркасе нет. */
  const listTopbarMenus = () => collectTopbarMenus(listScopes());

  /** Темы справки: по одной на область, которая принесла инструкции. */
  const listHelpTopics = () => collectHelpTopics(listScopes());

  /** Меню тулбара целиком, включая «Справку» из тех же областей. */
  function listTopbarSpec() {
    const menus = listTopbarMenus();
    const help = helpMenuSpec(listHelpTopics());
    return toMenuSpec(help ? [...menus, help] : menus);
  }

  return {
    registry: () => registry,
    loadScopes,
    importScopeModule,
    listScopes,
    getScope,
    listTools,
    listViewportContributions,
    mountScopes,
    activateScopes,
    listTopbarMenus,
    listHelpTopics,
    listTopbarSpec,
  };
}
