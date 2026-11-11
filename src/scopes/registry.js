/**
 * Реестр областей.
 *
 * Хранит паспорта, проверяет уникальность `id`, `areaId` и `selector`, а также
 * соответствие реализации зарегистрированному паспорту. `mountScopeNodes`
 * заменяет слоты `[data-scope-slot]` содержимым шаблонов областей.
 */
export function createScopeRegistry() {
  const scopes = new Map(), areas = new Set(), tools = new Set(), nodes = new Set(), selectors = new Set();
  function register(scope) {
    if (!scope || typeof scope.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(scope.id)) throw new Error('Invalid scope id');
    if (!scope.areaId || !scope.selector || !scope.label || typeof scope.template !== 'string') throw new Error(`Invalid scope: ${scope.id}`);
    if (scopes.has(scope.id) || areas.has(scope.areaId) || selectors.has(scope.selector)) throw new Error(`Duplicate scope or area: ${scope.id}`);
    for (const dependency of scope.dependencies ?? []) {
      if (!dependency || typeof dependency.selector !== 'string' || !dependency.selector || !Array.isArray(dependency.requires) || !dependency.requires.length || dependency.requires.some(id=>typeof id !== 'string' || !id))
        throw new Error(`Invalid dependency in ${scope.id}`);
    }
    const localTools = new Set(), localNodes = new Set();
    for (const tool of scope.tools ?? []) {
      if (!tool.id || !tool.nodeId || !tool.label || tools.has(tool.id) || localTools.has(tool.id) || nodes.has(tool.nodeId) || localNodes.has(tool.nodeId)) throw new Error(`Duplicate or invalid tool in ${scope.id}: ${tool.id}`);
      localTools.add(tool.id); localNodes.add(tool.nodeId);
    }
    scopes.set(scope.id, scope); areas.add(scope.areaId); selectors.add(scope.selector);
    for (const id of localTools) tools.add(id);
    for (const tool of scope.tools ?? []) nodes.add(tool.nodeId);
    return scope;
  }
  function bind(scope) {
    const previous = scopes.get(scope?.id);
    // Сверяем содержимое, а не ссылки: реализация вправе собрать паспорт заново
    // (`{ ...passport, init }`), и это не должно ломать связывание.
    const sameTools = JSON.stringify(previous?.tools ?? []) === JSON.stringify(scope?.tools ?? []);
    if (!previous || previous.areaId !== scope.areaId || previous.template !== scope.template || previous.selector !== scope.selector || !sameTools)
      throw new Error(`Cannot bind unregistered or mismatched scope: ${scope?.id}`);
    scopes.set(scope.id, scope);
    return scope;
  }
  return Object.freeze({ register, bind, get: id => scopes.get(id), list: () => [...scopes.values()] });
}

/** Replace each declared slot with the one actual scope root before engine boot. */
export function mountScopeNodes(registry, root = document) {
  for (const scope of registry.list()) {
    const slots = root.querySelectorAll(`[data-scope-slot="${scope.id}"]`);
    if (slots.length > 1) throw new Error(`Duplicate slots for scope ${scope.id}`);
    const template = root.createElement('template');
    template.innerHTML = scope.template.trim();
    const nodes = template.content.children;
    if (nodes.length !== 1 || !nodes[0].matches(scope.selector)) throw new Error(`Invalid root in scope ${scope.id}`);
    nodes[0].dataset.scope = scope.id;
    if (slots.length) slots[0].replaceWith(nodes[0]);
    else {
      // Third-party scopes can add a panel without editing the app's HTML.
      const host = root.querySelector(scope.placement === 'root' ? '#appRoot' : 'main.b-main');
      if (!host) throw new Error(`No host for scope ${scope.id}`);
      host.append(nodes[0]);
    }
  }
}
