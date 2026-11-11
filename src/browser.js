/**
 * Браузерная сборка: ядро, меню и обёртки над `uix-preparatorio`.
 *
 * Отдельная точка входа позволяет использовать ядро в Node (тесты, серверная
 * сборка) без установки библиотеки интерфейса.
 */
export * from "./index.js";
export { initMenuContributions, initViewMenu, initViewportMenu } from "./menu/index.js";
export { initCollapsibleSections, installVirtualDockSizing, installCompactDockSizing, createToolCatalogue } from "./shell/index.js";
