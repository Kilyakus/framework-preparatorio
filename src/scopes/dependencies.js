/**
 * Доступность элементов управления по наличию областей.
 *
 * Отличается от скрытия панели в доке: элемент остаётся в разметке, но
 * блокируется, пока области, от которой он зависит, нет в системе.
 */
export function createScopeAvailability(initial = []) {
  const available = new Set(initial), bindings = new Set(), listeners = new Set();
  function nativeDisabled(node) {
    for (let proto=Object.getPrototypeOf(node); proto; proto=Object.getPrototypeOf(proto)) {
      const descriptor=Object.getOwnPropertyDescriptor(proto, 'disabled');
      if (descriptor?.get && descriptor?.set) return descriptor;
    }
    return null;
  }
  function intercept(binding) {
    const node=binding.node, descriptor=nativeDisabled(node);
    if (!descriptor || Object.hasOwn(node, 'disabled')) return;
    binding.nativeDisabled=descriptor;
    Object.defineProperty(node, 'disabled', { configurable:true,
      get() { return descriptor.get.call(this); },
      set(value) {
        if (binding.blocked) { binding.previousDisabled=!!value; descriptor.set.call(this, true); }
        else descriptor.set.call(this, value);
      },
    });
  }
  function forceDisabled(binding, value) {
    if (binding.nativeDisabled) binding.nativeDisabled.set.call(binding.node, value);
    else binding.node.disabled = value;
  }
  function restore(binding) {
    binding.blocked = false;
    if (binding.nativeDisabled) { delete binding.node.disabled; binding.nativeDisabled=null; }
    binding.node.disabled = binding.previousDisabled;
    if (binding.previousAria == null) binding.node.removeAttribute('aria-disabled');
    else binding.node.setAttribute('aria-disabled', binding.previousAria);
    if (binding.previousTitle == null) binding.node.removeAttribute('title');
    else binding.node.setAttribute('title', binding.previousTitle);
    binding.blocked = false;
  }
  function update(binding) {
    const missing = binding.requires.filter(id => !available.has(id));
    if (missing.length) {
      if (!binding.blocked) {
        binding.previousDisabled = !!binding.node.disabled;
        binding.previousAria = binding.node.getAttribute('aria-disabled');
        binding.previousTitle = binding.node.getAttribute('title');
      }
      if (!binding.blocked) { binding.blocked = true; intercept(binding); }
      if (!binding.node.disabled) forceDisabled(binding, true);
      if (binding.node.getAttribute('aria-disabled') !== 'true') binding.node.setAttribute('aria-disabled', 'true');
      if (binding.node.getAttribute('title') !== `Недоступно: ${missing.join(', ')}`) binding.node.setAttribute('title', `Недоступно: ${missing.join(', ')}`);
    } else if (binding.blocked) restore(binding);
  }
  function setAvailable(id, enabled) {
    const before = available.has(id);
    if (enabled) available.add(id); else available.delete(id);
    if (before === !!enabled) return;
    for (const binding of bindings) update(binding);
    for (const listener of listeners) listener({id, available:!!enabled});
  }
  function bind(node, requires) {
    if (!node || !('disabled' in node)) throw new TypeError('Expected a disableable control');
    if (!Array.isArray(requires) || !requires.length || requires.some(id => typeof id !== 'string' || !id)) throw new TypeError('Expected scope dependencies');
    const binding = {node, requires:[...new Set(requires)], blocked:false};
    bindings.add(binding); update(binding);
    return () => { if (binding.blocked) restore(binding); bindings.delete(binding); };
  }
  return {
    has: id => available.has(id), setAvailable, bind,
    refresh: () => { for (const binding of bindings) update(binding); },
    onChange: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
