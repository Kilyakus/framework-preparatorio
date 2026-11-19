/**
 * Перенос узлов-вкладов в контейнер меню.
 *
 * Вклад объявляется в паспорте движка или области (идентификатор, подпись,
 * селектор узла, порядок). Модуль находит узел, переносит его в контейнер меню
 * и поддерживает соответствие при изменении реестра: источником состава меню
 * служит реестр вкладов, ручные списки не используются.
 *
 * Требует DOM: используется `MutationObserver`, чтобы учитывать узлы,
 * появившиеся после первого прохода (например, смонтированная позже область).
 */
/**
 * @param {object} options
 * @param {Document|HTMLElement} [options.root=document] где искать узлы
 * @param {string} options.hostSelector селектор контейнера меню
 * @param {() => object[]} options.list реестр вкладов (`listViewContributions`)
 * @param {string} options.eventName событие «вклады изменились»
 * @param {string} options.classPrefix префикс классов и `data`-атрибутов
 */
export function initMenuContributions({ root = document, hostSelector, list, eventName, classPrefix }) {
  if (!hostSelector) throw new TypeError("initMenuContributions: нужен hostSelector");
  if (typeof list !== "function") throw new TypeError("initMenuContributions: нужен list()");
  if (!eventName) throw new TypeError("initMenuContributions: нужно eventName");
  if (!classPrefix) throw new TypeError("initMenuContributions: нужен classPrefix");

  const host = root.querySelector(hostSelector);
  if (!host) return { sync() {}, dispose() {} };
  const mounted = new Map();

  function restore(id, entry) {
    entry.anchor.replaceWith(entry.node);
    entry.wrapper.remove();
    mounted.delete(id);
  }

  function sync() {
    const contributions = list();
    const live = new Set(contributions.map((item) => item.id));
    for (const [id, entry] of mounted) if (!live.has(id)) restore(id, entry);
    for (const item of contributions) {
      if (mounted.has(item.id)) continue;
      const node = root.querySelector(item.selector);
      if (!node || node === host || host.contains(node)) continue;
      const anchor = root.createComment(`${classPrefix}-contribution:${item.id}`);
      node.before(anchor);
      node.classList.remove("tab-content", "active");
      node.classList.add("menu-contribution-body", `${classPrefix}-menu-contribution-body`);
      node.setAttribute("role", "group");

      const wrapper = root.createElement("section");
      wrapper.className = `menu-contribution ${classPrefix}-menu-contribution`;
      wrapper.dataset.menuContribution = item.id;
      wrapper.dataset[`${classPrefix}Contribution`] = item.id;
      wrapper.dataset.menuOwner = item.owner;
      wrapper.dataset[`${classPrefix}Owner`] = item.owner;
      wrapper.style.order = String(item.order);
      wrapper.setAttribute("aria-label", item.label);

      const title = root.createElement("strong");
      title.className = `menu-contribution-title ${classPrefix}-menu-contribution-title`;
      title.textContent = item.label;

      wrapper.append(title, node);
      host.append(wrapper);
      mounted.set(item.id, { node, anchor, wrapper });
    }
  }

  const observer = new MutationObserver(sync);
  observer.observe(root.body ?? root.documentElement, { childList: true, subtree: true });
  window.addEventListener(eventName, sync);
  sync();

  return {
    sync,
    dispose() {
      observer.disconnect();
      window.removeEventListener(eventName, sync);
      for (const [id, entry] of [...mounted]) restore(id, entry);
    },
  };
}
