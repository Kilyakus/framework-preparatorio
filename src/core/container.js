/**
 * Контейнер компонентов (сервис-локатор с ленивым созданием).
 *
 * Компонент объявляется определением и создаётся при первом `get`. Определение:
 *
 *   • функция-фабрика        `(deps, container) => value`
 *   • класс                  создаётся через `new Class(config)`
 *   • `{ factory, inject }`  фабрика с зависимостями: `inject` — карта
 *                            `{имя: id компонента}`, значения приходят в `deps`
 *   • `{ class, config, inject }`   класс с конфигурацией
 *   • `{ value }`            готовое значение
 *
 * Компонент общий (одиночка), если не указано `shared: false`. Круговая
 * зависимость обнаруживается и сообщается цепочкой id. Если фабрика
 * возвращает `Promise` (динамический `import()`), он же и хранится: компонент
 * подгружается лениво и не тянет тяжёлые модули при описании приложения.
 */
const isClass = (value) => typeof value === "function" && /^class[\s{]/.test(Function.prototype.toString.call(value));

export function createContainer() {
  const definitions = new Map();
  const instances = new Map();
  const aliases = new Map();
  const created = [];
  const resolving = [];
  let disposed = false;

  const canonical = (id) => {
    const seen = new Set();
    let current = id;
    while (aliases.has(current)) {
      if (seen.has(current)) throw new Error(`Компонент «${id}»: круговой алиас`);
      seen.add(current);
      current = aliases.get(current);
    }
    return current;
  };

  function normalize(id, definition) {
    if (typeof definition === "function") {
      return isClass(definition) ? { class: definition } : { factory: definition };
    }
    if (definition && typeof definition === "object") {
      if ("value" in definition) return { value: definition.value };
      if (typeof definition.factory === "function" || typeof definition.class === "function") return { ...definition };
    }
    throw new TypeError(`Компонент «${id}»: определение — функция, класс, {factory}, {class} или {value}`);
  }

  function set(id, definition) {
    if (disposed) throw new Error("Контейнер уничтожен");
    if (typeof id !== "string" || !id) throw new TypeError("Компонент: нужен id");
    if (instances.has(id)) throw new Error(`Компонент «${id}» уже создан: переопределять поздно`);
    definitions.set(id, normalize(id, definition));
    return api;
  }

  function alias(name, target) {
    if (definitions.has(name)) throw new Error(`Алиас «${name}» совпадает с компонентом`);
    aliases.set(name, target);
    return api;
  }

  function build(id, definition) {
    const deps = {};
    for (const [name, dependency] of Object.entries(definition.inject ?? {})) deps[name] = get(dependency);
    if ("value" in definition) return definition.value;
    if (definition.class) return new definition.class(definition.config ?? {}, deps, api);
    return definition.factory(deps, api);
  }

  function get(requested) {
    if (disposed) throw new Error("Контейнер уничтожен");
    const id = canonical(requested);
    if (instances.has(id)) return instances.get(id);
    const definition = definitions.get(id);
    if (!definition) throw new Error(`Компонент «${requested}» не определён`);
    if (resolving.includes(id)) {
      throw new Error(`Круговая зависимость компонентов: ${[...resolving, id].join(" → ")}`);
    }
    resolving.push(id);
    try {
      const value = build(id, definition);
      if (definition.shared === false) return value;
      instances.set(id, value);
      created.push(id);
      return value;
    } finally {
      resolving.pop();
    }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    const errors = [];
    for (const id of created.reverse()) {
      try {
        const value = await instances.get(id);
        const release = value?.dispose ?? value?.destroy;
        if (typeof release === "function") await release.call(value);
      } catch (error) {
        errors.push(error);
      }
    }
    instances.clear();
    definitions.clear();
    aliases.clear();
    if (errors.length) throw new AggregateError(errors, "Ошибки при освобождении компонентов");
  }

  const api = {
    set,
    alias,
    get,
    has: (id) => definitions.has(canonical(id)),
    /** Компонент уже создан (без побочного создания). */
    isCreated: (id) => instances.has(canonical(id)),
    ids: () => [...definitions.keys()],
    /** Порядок, в котором создавались общие компоненты. */
    createdIds: () => [...created],
    dispose,
  };
  return Object.freeze(api);
}
