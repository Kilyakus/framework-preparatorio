/**
 * Модуль — самостоятельная часть приложения со своим паспортом.
 *
 * Модуль не знает приложения, в которое его включат: он объявляет, что ему
 * нужно (`requires`), что он даёт (`components`, `scopes`), какие значения
 * по умолчанию у его параметров и как себя запустить (`bootstrap`). Приложение
 * решает, включать ли его, в каком порядке и с какими переопределениями.
 *
 * Паспорт читается на старте и не должен тянуть `three`, DOM или файловую
 * систему: тяжёлые вещи подключаются лениво через определения компонентов
 * (`() => import(...)`).
 *
 * Поля паспорта:
 *   id          строчные буквы, цифры и дефис
 *   version     X.Y.Z
 *   title       человекочитаемое имя
 *   framework   требуемый диапазон версий каркаса (по умолчанию любой)
 *   requires    {id: диапазон} или [id] — без них модуль не запускается
 *   optional    {id: диапазон} или [id] — учитываются в порядке, если включены
 *   params      значения параметров по умолчанию
 *   components  {id: определение} — см. `createContainer`; id начинается с `<id модуля>.`
 *   scopes      вклады в сборку интерфейса: engines, pluginScopes, loaders,
 *               viewContributions, viewportContributions
 *   bootstrap   async (app, module) — после регистрации всех компонентов
 *   dispose     async (app, module) — обратный порядок запуска
 */
import { parseVersion, satisfies } from "./semver.js";

const MODULE_ID = /^[a-z][a-z0-9-]*$/;

/** `['a']` или `{a: '^1.0.0'}` → `{a: '^1.0.0'}`. */
function normalizeRequirements(value, owner, field) {
  if (value === undefined || value === null) return Object.freeze({});
  const entries = Array.isArray(value) ? value.map((id) => [id, "*"]) : Object.entries(value);
  if (!Array.isArray(value) && (typeof value !== "object")) {
    throw new TypeError(`Модуль ${owner}: ${field} — массив id или карта id → диапазон`);
  }
  const result = {};
  for (const [id, range] of entries) {
    if (typeof id !== "string" || !MODULE_ID.test(id)) throw new TypeError(`Модуль ${owner}: ${field} содержит неверный id «${id}»`);
    if (id === owner) throw new TypeError(`Модуль ${owner}: ${field} ссылается на сам модуль`);
    if (typeof range !== "string") throw new TypeError(`Модуль ${owner}: диапазон версий ${id} — строка`);
    satisfies("0.0.0", range); // проверка синтаксиса диапазона
    result[id] = range;
  }
  return Object.freeze(result);
}

/** Проверить и заморозить паспорт модуля. */
export function defineModule(definition) {
  const id = definition?.id;
  if (typeof id !== "string" || !MODULE_ID.test(id)) throw new TypeError(`Модуль: неверный id «${id}»`);
  parseVersion(definition.version);
  satisfies("0.0.0", definition.framework ?? "*");
  for (const field of ["bootstrap", "dispose"]) {
    if (definition[field] !== undefined && typeof definition[field] !== "function") {
      throw new TypeError(`Модуль ${id}: ${field} должен быть функцией`);
    }
  }
  const components = definition.components ?? {};
  for (const key of Object.keys(components)) {
    if (key !== id && !key.startsWith(`${id}.`)) {
      throw new TypeError(`Модуль ${id}: компонент «${key}» должен называться «${id}.<имя>»`);
    }
  }
  const scopes = definition.scopes ?? {};
  for (const field of ["engines", "pluginScopes", "loaders", "viewContributions", "viewportContributions"]) {
    if (scopes[field] !== undefined && !Array.isArray(scopes[field])) {
      throw new TypeError(`Модуль ${id}: scopes.${field} должен быть массивом`);
    }
  }
  return Object.freeze({
    id,
    version: String(definition.version),
    title: definition.title ?? id,
    framework: definition.framework ?? "*",
    requires: normalizeRequirements(definition.requires, id, "requires"),
    optional: normalizeRequirements(definition.optional, id, "optional"),
    params: Object.freeze({ ...(definition.params ?? {}) }),
    components: Object.freeze({ ...components }),
    scopes: Object.freeze({ ...scopes }),
    bootstrap: definition.bootstrap,
    dispose: definition.dispose,
  });
}

/**
 * Порядок запуска: зависимости раньше зависимых, при равенстве — порядок
 * конфигурации. Ошибки собираются целиком, чтобы одна правка конфигурации
 * исправляла все проблемы сразу.
 *
 * @param {object[]} modules паспорта включённых модулей в порядке конфигурации
 * @param {{disabled?: Iterable<string>}} [options] id отключённых модулей
 */
export function resolveModuleOrder(modules, { disabled = [] } = {}) {
  const byId = new Map();
  for (const module of modules) {
    if (byId.has(module.id)) throw new Error(`Дубликат модуля «${module.id}»`);
    byId.set(module.id, module);
  }
  const off = new Set(disabled);
  const problems = [];
  for (const module of modules) {
    for (const [id, range] of Object.entries(module.requires)) {
      const dependency = byId.get(id);
      if (!dependency) {
        problems.push(off.has(id)
          ? `${module.id}: требует отключённый модуль «${id}»`
          : `${module.id}: требует модуль «${id}», которого нет в конфигурации`);
      } else if (!satisfies(dependency.version, range)) {
        problems.push(`${module.id}: требует ${id} ${range}, подключена версия ${dependency.version}`);
      }
    }
    for (const [id, range] of Object.entries(module.optional)) {
      const dependency = byId.get(id);
      if (dependency && !satisfies(dependency.version, range)) {
        problems.push(`${module.id}: необязательный ${id} ${range} несовместим с версией ${dependency.version}`);
      }
    }
  }
  if (problems.length) throw new Error(`Модули несовместимы:\n  ${problems.join("\n  ")}`);

  const order = [];
  const state = new Map();
  const path = [];
  function visit(module) {
    const mark = state.get(module.id);
    if (mark === "done") return;
    if (mark === "active") {
      const loop = [...path.slice(path.indexOf(module.id)), module.id];
      throw new Error(`Круговая зависимость модулей: ${loop.join(" → ")}`);
    }
    state.set(module.id, "active");
    path.push(module.id);
    for (const id of [...Object.keys(module.requires), ...Object.keys(module.optional)]) {
      const dependency = byId.get(id);
      if (dependency) visit(dependency);
    }
    path.pop();
    state.set(module.id, "done");
    order.push(module);
  }
  for (const module of modules) visit(module);
  return order;
}
