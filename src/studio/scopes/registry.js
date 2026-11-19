// Реестр областей (scope) интерфейса.
//
// Область — живая панель дока: она владеет своей разметкой, метаданными и
// обработчиками. Области не знают друг о друге и не лезут в чужой DOM: каркас
// выдаёт им корневой узел, а всё общее приходит через контекст активации.
//
// Реестр проверяет уникальность id области, id панели дока, селектора корня,
// а также id инструментов и id их узлов — глобально, а не внутри области:
// иначе два плагина молча делили бы одну вкладку или один блок разметки.
import { validateTopbarMenus, validateTopbarSections } from '../topbar/index.js';
import { validateHelp } from '../help/index.js';

const SCOPE_ID = /^[a-z][a-z0-9-]*$/;

export function createScopeRegistry() {
  const scopes = new Map();
  const areas = new Set();
  const selectors = new Set();
  const tools = new Set();
  const nodes = new Set();

  function register(scope) {
    if (!scope || typeof scope.id !== 'string' || !SCOPE_ID.test(scope.id)) {
      throw new Error(`Область: неверный id «${scope?.id}»`);
    }
    if (!scope.areaId || !scope.selector || !scope.label || typeof scope.template !== 'string') {
      throw new Error(`Область ${scope.id}: нужны areaId, selector, label и template`);
    }
    if (scopes.has(scope.id) || areas.has(scope.areaId) || selectors.has(scope.selector)) {
      throw new Error(`Область ${scope.id}: id, areaId или selector уже заняты`);
    }
    for (const dependency of scope.dependencies ?? []) {
      const valid = dependency
        && typeof dependency.selector === 'string' && dependency.selector
        && Array.isArray(dependency.requires) && dependency.requires.length
        && dependency.requires.every((id) => typeof id === 'string' && id);
      if (!valid) throw new Error(`Область ${scope.id}: неверная зависимость`);
    }
    // Тулбар и справка — такие же вклады области, их проверяем при регистрации.
    validateTopbarMenus(scope);
    validateTopbarSections(scope);
    validateHelp(scope);
    const localTools = new Set();
    const localNodes = new Set();
    for (const tool of scope.tools ?? []) {
      if (!tool.id || !tool.nodeId || !tool.label
        || tools.has(tool.id) || localTools.has(tool.id)
        || nodes.has(tool.nodeId) || localNodes.has(tool.nodeId)) {
        throw new Error(`Область ${scope.id}: неверный или повторяющийся инструмент «${tool.id}»`);
      }
      localTools.add(tool.id);
      localNodes.add(tool.nodeId);
    }
    scopes.set(scope.id, scope);
    areas.add(scope.areaId);
    selectors.add(scope.selector);
    for (const id of localTools) tools.add(id);
    for (const tool of scope.tools ?? []) nodes.add(tool.nodeId);
    return scope;
  }

  /** Привязывает реализацию (activate) к уже зарегистрированным метаданным. */
  function bind(scope) {
    const previous = scopes.get(scope?.id);
    if (!previous
      || previous.areaId !== scope.areaId
      || previous.selector !== scope.selector
      || previous.template !== scope.template) {
      throw new Error(`Область ${scope?.id}: реализация не совпадает с метаданными`);
    }
    scopes.set(scope.id, scope);
    return scope;
  }

  return Object.freeze({
    register,
    bind,
    get: (id) => scopes.get(id),
    list: () => [...scopes.values()],
  });
}

/**
 * Заменяет слоты каркаса корневыми узлами областей — до запуска приложения.
 *
 * Слот: `<div data-scope-slot="outliner"></div>`. Если слота нет, панель
 * добавляется в контейнер приложения: сторонняя область появляется, не правя
 * общий HTML. Разметка переносится целиком, поэтому все id и обработчики,
 * которые на них завязаны, продолжают работать.
 */
const PANEL_HOSTS = '#studioContent, main.b-main';
const ROOT_HOSTS = '#appRoot, body';

/** Первый существующий контейнер из списка селекторов. */
function pickContainer(root, selectors) {
  for (const selector of String(selectors).split(',').map((item) => item.trim()).filter(Boolean)) {
    const node = root.querySelector(selector);
    if (node) return node;
  }
  return null;
}

export function mountScopeNodes(registry, root = document, { host = PANEL_HOSTS, rootHost = ROOT_HOSTS } = {}) {
  for (const scope of registry.list()) {
    const slots = root.querySelectorAll(`[data-scope-slot="${scope.id}"]`);
    if (slots.length > 1) throw new Error(`Область ${scope.id}: больше одного слота`);
    const template = root.createElement('template');
    template.innerHTML = scope.template.trim();
    const nodes = template.content.children;
    if (nodes.length !== 1 || !nodes[0].matches(scope.selector)) {
      throw new Error(`Область ${scope.id}: шаблон должен иметь один корень, совпадающий с ${scope.selector}`);
    }
    const node = nodes[0];
    node.dataset.scope = scope.id;
    if (slots.length) {
      slots[0].replaceWith(node);
      continue;
    }
    const container = pickContainer(root, scope.placement === 'root' ? rootHost : host);
    if (!container) throw new Error(`Область ${scope.id}: нет контейнера для панели (${scope.placement === 'root' ? rootHost : host})`);
    container.append(node);
  }
}
