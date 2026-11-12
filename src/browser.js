/**
 * Браузерная сборка: ядро, меню, оболочка, вклады областей и загрузчик.
 *
 * Отдельная точка входа позволяет использовать ядро в Node (тесты, серверная
 * сборка) без установки библиотеки интерфейса: `/menu` и `/shell` требуют
 * `uix-preparatorio`, остальные подпути — нет.
 */
export * from "./index.js";
export { initMenuContributions, initViewMenu, initViewportMenu } from "./menu/index.js";
export { initCollapsibleSections, installVirtualDockSizing, installCompactDockSizing, createToolCatalogue } from "./shell/index.js";
export {
  validateTopbarMenus,
  validateTopbarSections,
  collectTopbarMenus,
  toMenuSpec,
  topbarActions,
  helpMenuSpec,
} from "./topbar/index.js";
export { validateHelp, collectHelpTopics, mountHelp } from "./help/index.js";
export { createScopeLoader, versionedModuleUrl, importScopeUrl } from "./runtime/index.js";
