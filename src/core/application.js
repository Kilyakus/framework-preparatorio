/**
 * Приложение — ядро, в которое подключаются модули и компоненты.
 *
 * Как в Yii2: ядро ничего не знает о конкретных движках, студиях и персонажах.
 * Всё, из чего состоит приложение, приходит конфигурацией:
 *
 *   createApplication({
 *     id: "studio",
 *     params: { ... },
 *     components: { storage: () => ... },        // свои или переопределения
 *     modules: {                                  // подключаемые модули
 *       evolvia: () => import("fws-evolvia/module"),
 *       physio:  { module: () => import("fws-physio/module"), params: { gravity: -5 } },
 *       animio:  { module: ..., enabled: false },
 *     },
 *     scopes: { preferred: [...], builtInScopes: { viewport3d: { enabled: true } } },
 *     bootstrap: ["storage", (app) => ...],       // после запуска модулей
 *   });
 *
 * Жизненный цикл: `init` (читает паспорта, проверяет совместимость, строит
 * порядок, регистрирует компоненты и параметры) → `bootstrap` (запускает модули
 * по порядку зависимостей, собирает области) → `run` → `dispose` (обратный
 * порядок). Каждый шаг выполняется один раз; ошибка запуска откатывает уже
 * запущенные модули.
 *
 * Приоритет значений (от слабого к сильному): параметры модуля по умолчанию →
 * `params` приложения → `params` записи модуля. Компоненты: модуль → запись
 * модуля → `components` приложения.
 */
import { createContainer } from "./container.js";
import { createEventBus } from "./events.js";
import { createParams, mergeConfig, loadConfig } from "./config.js";
import { defineModule, resolveModuleOrder } from "./module.js";
import { createScopeComposer, hasScopeContributions } from "./scopes.js";
import { FRAMEWORK_VERSION } from "./version.js";
import { satisfies } from "./semver.js";

const STATES = Object.freeze(["created", "initializing", "initialized", "bootstrapping", "bootstrapped", "disposed"]);

const isDefinition = (value) => value && typeof value === "object" && typeof value.id === "string" && "version" in value;
const isNamespace = (value) => value && typeof value === "object" && Object.prototype.toString.call(value) === "[object Module]";

/** Раскрыть запись модуля: паспорт, загрузчик, пространство имён или обёртка. */
async function resolveEntry(key, entry) {
  let wrapper = { enabled: true };
  let source = entry;
  if (entry && typeof entry === "object" && !isDefinition(entry) && !isNamespace(entry) && "module" in entry) {
    const { module, ...rest } = entry;
    wrapper = { enabled: true, ...rest };
    source = module;
  }
  if (wrapper.enabled === false) return { key, enabled: false, wrapper };
  let value = await (typeof source === "function" ? source() : source);
  if (isNamespace(value) && !isDefinition(value)) value = value.default ?? value.module;
  if (!isDefinition(value)) throw new TypeError(`Модуль «${key}»: не получен паспорт (нужен defineModule({id, version, ...}))`);
  const definition = defineModule(value);
  if (definition.id !== key) throw new Error(`Модуль «${key}» в конфигурации, но паспорт называется «${definition.id}»`);
  return { key, enabled: true, wrapper, definition };
}

export function createApplication(config = {}, { frameworkVersion = FRAMEWORK_VERSION } = {}) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("createApplication: конфигурация должна быть объектом");
  }
  const container = createContainer();
  const events = createEventBus();
  const params = createParams(config.params);
  let state = "created";
  let order = [];
  let entries = new Map();
  let composer = null;
  const started = [];
  const phases = {};

  const emit = (name, payload) => events.emitAsync(name, payload);

  const app = {
    id: config.id ?? "app",
    frameworkVersion,
    params,
    events,
    container,
    on: events.on,
    once: events.once,
    get state() {
      return state;
    },
    get: (id) => container.get(id),
    has: (id) => container.has(id),
    /** Паспорта включённых модулей в порядке запуска. */
    get modules() {
      return [...order];
    },
    /** Паспорт включённого модуля. */
    module(id) {
      const module = order.find((item) => item.id === id);
      if (!module) throw new Error(`Модуль «${id}» не подключён`);
      return module;
    },
    isEnabled: (id) => order.some((item) => item.id === id),
    /** Собиратель областей (создаётся после `init`). */
    get scopes() {
      if (!composer) throw new Error("Области доступны после init()");
      return composer;
    },
    init: () => (phases.init ??= init()),
    bootstrap: () => (phases.bootstrap ??= bootstrap()),
    async run(main) {
      await app.bootstrap();
      return main ? main(app) : app;
    },
    dispose: () => (phases.dispose ??= dispose()),
  };

  async function init() {
    if (state !== "created") throw new Error(`init: приложение в состоянии «${state}»`);
    state = "initializing";
    await emit("beforeInit", app);

    const resolved = [];
    for (const [key, entry] of Object.entries(config.modules ?? {})) resolved.push(await resolveEntry(key, entry));
    entries = new Map(resolved.filter((item) => item.enabled).map((item) => [item.key, item]));
    const disabled = resolved.filter((item) => !item.enabled).map((item) => item.key);

    for (const { definition } of entries.values()) {
      if (!satisfies(frameworkVersion, definition.framework)) {
        throw new Error(`Модуль ${definition.id} требует каркас ${definition.framework}, подключён ${frameworkVersion}`);
      }
    }
    order = resolveModuleOrder([...entries.values()].map((item) => item.definition), { disabled });

    container.set("app", { value: app });
    container.set("events", { value: events });
    container.set("params", { value: params });
    for (const module of order) {
      params.defaults({ [module.id]: module.params });
      for (const [id, definition] of Object.entries(module.components)) container.set(id, definition);
    }
    for (const module of order) {
      const { wrapper } = entries.get(module.id);
      if (wrapper.params) params.override({ [module.id]: wrapper.params });
      for (const [id, definition] of Object.entries(wrapper.components ?? {})) container.set(id, definition);
    }
    for (const [id, definition] of Object.entries(config.components ?? {})) container.set(id, definition);

    composer = createScopeComposer({ modules: order, config: config.scopes ?? {} });
    container.set("scopes", { value: composer });
    state = "initialized";
    await emit("afterInit", app);
    return app;
  }

  async function startModules() {
    for (const module of order) {
      try {
        await module.bootstrap?.(app, module);
      } catch (cause) {
        throw new Error(`Модуль ${module.id}: ошибка bootstrap — ${cause?.message ?? cause}`, { cause });
      }
      started.push(module);
      await emit("module:bootstrapped", { id: module.id, module });
    }
  }

  async function stopModules() {
    const errors = [];
    while (started.length) {
      const module = started.pop();
      try {
        await module.dispose?.(app, module);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  async function bootstrap() {
    await app.init();
    if (state !== "initialized") throw new Error(`bootstrap: приложение в состоянии «${state}»`);
    state = "bootstrapping";
    try {
      await emit("beforeBootstrap", app);
      await startModules();
      const scopesConfig = config.scopes ?? {};
      if (hasScopeContributions(order, scopesConfig)) {
        composer.compose();
        if (scopesConfig.bind !== false) await composer.bind();
        if (scopesConfig.mount) {
          const { root, options } = scopesConfig.mount === true ? {} : scopesConfig.mount;
          composer.mount(root, options);
        }
      }
      for (const step of config.bootstrap ?? []) {
        if (typeof step === "string") await container.get(step);
        else if (typeof step === "function") await step(app);
        else throw new TypeError("bootstrap: шаг — id компонента или функция");
      }
      state = "bootstrapped";
      await emit("afterBootstrap", app);
      return app;
    } catch (error) {
      // Откат: уже запущенные модули освобождаются в обратном порядке.
      const rollback = await stopModules();
      state = "initialized";
      phases.bootstrap = undefined;
      if (rollback.length) throw new AggregateError([error, ...rollback], `Запуск не удался: ${error?.message ?? error}`);
      throw error;
    }
  }

  async function dispose() {
    if (state === "disposed") return;
    const errors = [];
    try {
      if (state !== "created") await emit("beforeDispose", app);
    } catch (error) {
      errors.push(error);
    }
    errors.push(...(await stopModules()));
    try {
      await container.dispose();
    } catch (error) {
      errors.push(...(error instanceof AggregateError ? error.errors : [error]));
    }
    state = "disposed";
    try {
      await emit("afterDispose", app);
    } catch (error) {
      errors.push(error);
    }
    events.clear();
    if (errors.length) throw new AggregateError(errors, "Ошибки при освобождении приложения");
  }

  return Object.freeze(app);
}

/** Собрать приложение из нескольких источников конфигурации (см. `loadConfig`). */
export async function createApplicationFrom(source, context = {}, options) {
  return createApplication(await loadConfig(source, context), options);
}

export { STATES as APPLICATION_STATES, mergeConfig };
