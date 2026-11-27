/**
 * Ядро каркаса: приложение, модули, контейнер компонентов, события и конфигурация.
 * Не имеет внешних зависимостей и не требует DOM.
 */
export { FRAMEWORK_VERSION } from "./version.js";
export { parseVersion, compareVersions, satisfies } from "./semver.js";
export { mergeConfig, defineConfig, loadConfig, createParams, getPath } from "./config.js";
export { createEventBus } from "./events.js";
export { createContainer } from "./container.js";
export { defineModule, resolveModuleOrder } from "./module.js";
export { createScopeComposer, hasScopeContributions } from "./scopes.js";
export { createApplication, createApplicationFrom, APPLICATION_STATES } from "./application.js";
