/**
 * Меню настроек области просмотра (`viewportContributions`).
 *
 * Контейнер по умолчанию — `#viewportHeaderMenuContributions`.
 */
import { listViewportContributions } from "../contributions/view-contributions.js";
import { initMenuContributions } from "./contributions-menu.js";

/**
 * Меню самой области просмотра: её настройки (`viewportContributions`).
 *
 * Хост по умолчанию — `#viewportHeaderMenuContributions`.
 */
export function initViewportMenu({ root = document, hostSelector = "#viewportHeaderMenuContributions" } = {}) {
  return initMenuContributions({
    root,
    hostSelector,
    list: listViewportContributions,
    eventName: "ui:viewport-contributions-changed",
    classPrefix: "viewport",
  });
}
