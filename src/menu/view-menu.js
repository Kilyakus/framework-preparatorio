/**
 * Меню «Вид»: вклады движков и областей (`viewContributions`).
 *
 * Контейнер по умолчанию — `#viewMenuContributions`; приложение может указать
 * другой через `hostSelector`.
 */
import { listViewContributions } from "../contributions/view-contributions.js";
import { initMenuContributions } from "./contributions-menu.js";

/**
 * Меню «Вид»: сюда приезжают вклады движков и областей (`viewContributions`).
 *
 * Хост по умолчанию — `#viewMenuContributions`; приложение может указать свой,
 * не меняя каркас.
 */
export function initViewMenu({ root = document, hostSelector = "#viewMenuContributions" } = {}) {
  return initMenuContributions({
    root,
    hostSelector,
    list: listViewContributions,
    eventName: "ui:view-contributions-changed",
    classPrefix: "view",
  });
}
