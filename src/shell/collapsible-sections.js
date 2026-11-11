/**
 * Сворачивание секций панели.
 *
 * Механику предоставляет `uix-preparatorio`; каркас определяет место хранения
 * состояния — `state[scope].sections` того объекта, который сохраняет
 * приложение. Отдельный ключ в `localStorage` не используется, поэтому
 * состояние секций сохраняется вместе с остальными настройками.
 */
import { initCollapsibleSections as initFromLibrary } from "uix-preparatorio";

/**
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {object|null} [options.state=null] состояние приложения
 * @param {() => void} [options.persist] сохранение после изменения
 * @param {string} [options.scope="viewport"] ветка состояния под секции
 */
export function initCollapsibleSections({ root = document, state = null, persist = () => {}, scope = "viewport" } = {}) {
  return initFromLibrary({
    root,
    persist,
    storage: () => {
      if (!state) return null;
      if (!state[scope] || typeof state[scope] !== "object") state[scope] = {};
      if (!state[scope].sections || typeof state[scope].sections !== "object") state[scope].sections = {};
      return state[scope].sections;
    },
  });
}
