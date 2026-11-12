// Доступность областей — не то же самое, что видимость панели в доке.
//
// Скрытие области («Области») убирает панель, но сохраняет настройки. Отключение
// области плагином снимает панель и блокирует элементы, которые без неё не имеют
// смысла. Блокировка декларативная: область объявляет `dependencies` в метаданных
// или `data-requires-scope="control physics"` прямо в разметке.
//
// Нативный сеттер `disabled` перехватывается: приложение продолжает выставлять
// свои значения, но пока зависимость отсутствует, элемент остаётся выключенным.
// При возвращении зависимости восстанавливается СОБСТВЕННОЕ состояние элемента,
// а не «включено».

function nativeDisabledDescriptor(node) {
  for (let proto = Object.getPrototypeOf(node); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'disabled');
    if (descriptor?.get && descriptor?.set) return descriptor;
  }
  return null;
}

export function createScopeAvailability(initial = []) {
  const available = new Set(initial);
  const bindings = new Set();
  const listeners = new Set();

  function intercept(binding) {
    const descriptor = nativeDisabledDescriptor(binding.node);
    if (!descriptor || Object.hasOwn(binding.node, 'disabled')) return;
    binding.nativeDisabled = descriptor;
    Object.defineProperty(binding.node, 'disabled', {
      configurable: true,
      get() { return descriptor.get.call(this); },
      set(value) {
        if (binding.blocked) {
          binding.previousDisabled = Boolean(value);
          descriptor.set.call(this, true);
        } else descriptor.set.call(this, value);
      },
    });
  }

  function forceDisabled(binding, value) {
    if (binding.nativeDisabled) binding.nativeDisabled.set.call(binding.node, value);
    else binding.node.disabled = value;
  }

  function restore(binding) {
    binding.blocked = false;
    if (binding.nativeDisabled) {
      delete binding.node.disabled;
      binding.nativeDisabled = null;
    }
    binding.node.disabled = binding.previousDisabled;
    if (binding.previousAria == null) binding.node.removeAttribute('aria-disabled');
    else binding.node.setAttribute('aria-disabled', binding.previousAria);
    if (binding.previousTitle == null) binding.node.removeAttribute('title');
    else binding.node.setAttribute('title', binding.previousTitle);
  }

  function update(binding) {
    const missing = binding.requires.filter((id) => !available.has(id));
    if (missing.length) {
      if (!binding.blocked) {
        binding.previousDisabled = Boolean(binding.node.disabled);
        binding.previousAria = binding.node.getAttribute('aria-disabled');
        binding.previousTitle = binding.node.getAttribute('title');
        binding.blocked = true;
        intercept(binding);
      }
      if (!binding.node.disabled) forceDisabled(binding, true);
      const title = `Недоступно: ${missing.join(', ')}`;
      if (binding.node.getAttribute('aria-disabled') !== 'true') binding.node.setAttribute('aria-disabled', 'true');
      if (binding.node.getAttribute('title') !== title) binding.node.setAttribute('title', title);
    } else if (binding.blocked) restore(binding);
  }

  function setAvailable(id, enabled) {
    const before = available.has(id);
    if (enabled) available.add(id);
    else available.delete(id);
    if (before === Boolean(enabled)) return;
    for (const binding of bindings) update(binding);
    for (const listener of listeners) listener({ id, available: Boolean(enabled) });
  }

  function bind(node, requires) {
    if (!node || !('disabled' in node)) throw new TypeError('Ожидался элемент с состоянием disabled');
    if (!Array.isArray(requires) || !requires.length || requires.some((id) => typeof id !== 'string' || !id)) {
      throw new TypeError('Ожидался список областей-зависимостей');
    }
    const binding = { node, requires: [...new Set(requires)], blocked: false };
    bindings.add(binding);
    update(binding);
    return () => {
      if (binding.blocked) restore(binding);
      bindings.delete(binding);
    };
  }

  return {
    has: (id) => available.has(id),
    setAvailable,
    bind,
    refresh: () => { for (const binding of bindings) update(binding); },
    onChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

/** Собирает зависимости областей из метаданных и из разметки. */
export function bindScopeDependencies(scopes, availability, root = document) {
  const releases = [];
  for (const scope of scopes) {
    for (const dependency of scope.dependencies ?? []) {
      for (const node of root.querySelectorAll(dependency.selector)) {
        releases.push(availability.bind(node, dependency.requires));
      }
    }
  }
  for (const node of root.querySelectorAll('[data-requires-scope]')) {
    const requires = node.dataset.requiresScope.split(/[\s,]+/).filter(Boolean);
    if (requires.length) releases.push(availability.bind(node, requires));
  }
  return () => { while (releases.length) releases.pop()(); };
}
