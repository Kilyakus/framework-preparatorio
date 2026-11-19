/**
 * Браузерная сборка: ядро, меню, оболочка, вклады областей и загрузчик.
 *
 * Отдельная точка входа позволяет использовать ядро в Node (тесты, серверная
 * сборка) без установки библиотеки интерфейса: `/menu` и `/shell` требуют
 * `uix-preparatorio`, остальные подпути — нет.
 */
export * from "./main.js";
export { initMenuContributions, initViewMenu, initViewportMenu } from "../studio/menu/index.js";
export { initCollapsibleSections, installVirtualDockSizing, installCompactDockSizing, createToolCatalogue } from "../studio/shell/index.js";
export {
  validateTopbarMenus,
  validateTopbarSections,
  collectTopbarMenus,
  toMenuSpec,
  topbarActions,
  helpMenuSpec,
} from "../studio/topbar/index.js";
export { validateHelp, collectHelpTopics, mountHelp } from "../studio/help/index.js";
export { createScopeLoader, versionedModuleUrl, importScopeUrl } from "../studio/runtime/index.js";
