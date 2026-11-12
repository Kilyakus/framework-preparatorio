// Справка — вклад областей, а не одна статичная страница.
//
// Область объявляет в registry.js:
//   help: { label?, order?, template }
// где `template` — HTML её инструкций. Диалог строит по ним левый список
// вкладок (текстом, как рейка разделов в «Параметрах персонажа») и показывает
// содержимое активной. Сколько областей принесли справку — столько вкладок.
//
// Модуль — чистые данные и разметка: DOM появляется только в mountHelp.

/** Проверка вклада справки. */
export function validateHelp(scope) {
  const help = scope.help;
  if (!help) return true;
  if (typeof help.template !== 'string' || !help.template.trim()) {
    throw new Error(`Справка ${scope.id}: нужен непустой template`);
  }
  return true;
}

const orderOf = (entry, fallback) => (typeof entry.order === 'number' ? entry.order : fallback);

/** Темы справки в порядке областей. */
export function collectHelpTopics(scopes = []) {
  return scopes
    .filter((scope) => scope.help?.template)
    .map((scope) => ({
      id: scope.id,
      label: scope.help.label || scope.label,
      order: orderOf(scope.help, orderOf(scope, 1000)),
      template: scope.help.template,
    }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/**
 * Диалог справки: вкладки слева, содержимое справа.
 * @param {Element} host контейнер .b-help-body
 * @param {Array} topics результат collectHelpTopics
 */
export function mountHelp(host, topics = []) {
  if (!host) return { show() {}, active: () => null, dispose() {} };
  host.replaceChildren();
  host.classList.add('b-help-body-tabbed');

  const nav = document.createElement('div');
  nav.className = 'b-help-tabs';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Разделы справки');
  const body = document.createElement('div');
  body.className = 'b-help-pages';
  host.append(nav, body);

  const pages = new Map();
  const buttons = new Map();
  let current = null;

  function show(id) {
    const next = pages.has(id) ? id : (topics[0]?.id ?? null);
    if (!next) return;
    current = next;
    for (const [key, page] of pages) {
      const active = key === next;
      page.hidden = !active;
      const button = buttons.get(key);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    body.scrollTop = 0;
  }

  for (const topic of topics) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'b-help-tab';
    button.textContent = topic.label;
    button.dataset.helpTopic = topic.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.addEventListener('click', () => show(topic.id));
    // Стрелки водят по вкладкам — как в рейке разделов.
    button.addEventListener('keydown', (event) => {
      const keys = { ArrowDown: 1, ArrowUp: -1 };
      if (event.key in keys) {
        event.preventDefault();
        const index = topics.findIndex((entry) => entry.id === topic.id);
        const next = topics[(index + keys[event.key] + topics.length) % topics.length];
        show(next.id);
        buttons.get(next.id)?.focus();
      } else if (event.key === 'Home') { event.preventDefault(); show(topics[0].id); buttons.get(topics[0].id)?.focus(); }
      else if (event.key === 'End') { event.preventDefault(); show(topics.at(-1).id); buttons.get(topics.at(-1).id)?.focus(); }
    });
    nav.append(button);
    buttons.set(topic.id, button);

    const page = document.createElement('section');
    page.className = 'b-help-page';
    page.dataset.helpPage = topic.id;
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-label', topic.label);
    page.innerHTML = topic.template;
    page.hidden = true;
    body.append(page);
    pages.set(topic.id, page);
  }

  show(topics[0]?.id);
  return {
    show,
    active: () => current,
    topics: () => topics.map((topic) => ({ id: topic.id, label: topic.label })),
    dispose() { host.replaceChildren(); host.classList.remove('b-help-body-tabbed'); },
  };
}

export default collectHelpTopics;
