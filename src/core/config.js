/**
 * Конфигурация приложения.
 *
 * Как в Yii2, состав приложения описывается данными: `config/app.js` задаёт
 * компоненты, модули и параметры, а локальный файл поверх него переопределяет
 * только нужное. Здесь — правила слияния и загрузки таких файлов.
 */
const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Глубокое слияние конфигураций слева направо.
 *
 * Простые объекты сливаются по ключам; массивы, функции, классы и экземпляры
 * заменяются целиком — иначе список модулей или порядок областей нельзя было бы
 * переопределить. `undefined` ничего не меняет, `null` сбрасывает значение.
 */
export function mergeConfig(...configs) {
  const result = {};
  for (const config of configs) {
    if (config === undefined || config === null) continue;
    if (!isPlainObject(config)) throw new TypeError("mergeConfig: конфигурация должна быть простым объектом");
    for (const [key, value] of Object.entries(config)) {
      if (value === undefined) continue;
      if (isPlainObject(value) && isPlainObject(result[key])) result[key] = mergeConfig(result[key], value);
      else result[key] = isPlainObject(value) ? mergeConfig(value) : value;
    }
  }
  return result;
}

/** Тождественная функция: подсказка редактору и единая точка для будущей проверки схемы. */
export const defineConfig = (config) => config;

/**
 * Привести источник конфигурации к объекту.
 *
 * Источник: объект, функция (в том числе асинхронная), пространство имён
 * ES-модуля с `default`, либо массив таких источников — они сливаются по
 * порядку. Функция получает `context` (например, `{env}`), поэтому один файл
 * может собирать разные окружения.
 */
const isNamespace = (value) => value !== null && typeof value === "object" && Object.prototype.toString.call(value) === "[object Module]";

export async function loadConfig(source, context = {}) {
  if (Array.isArray(source)) {
    const loaded = [];
    for (const item of source) loaded.push(await loadConfig(item, context));
    return mergeConfig(...loaded);
  }
  let value = await source;
  if (isNamespace(value)) value = value.default;
  if (typeof value === "function") value = await value(context);
  if (isNamespace(value)) value = value.default;
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) throw new TypeError("loadConfig: источник должен давать простой объект");
  return mergeConfig(value);
}

/** Чтение вложенного значения по пути `a.b.c`. */
export function getPath(object, path, fallback = undefined) {
  let current = object;
  for (const key of String(path).split(".")) {
    if (current === null || typeof current !== "object" || !(key in current)) return fallback;
    current = current[key];
  }
  return current;
}

/**
 * Параметры приложения: только чтение снаружи, значения по умолчанию задают
 * модули, итоговые — приложение.
 */
export function createParams(initial = {}) {
  let values = mergeConfig(initial);
  return Object.freeze({
    get: (path, fallback) => getPath(values, path, fallback),
    has: (path) => getPath(values, path, Symbol.for("preparatorio.missing")) !== Symbol.for("preparatorio.missing"),
    all: () => mergeConfig(values),
    /** Слить значения по умолчанию под уже заданные. */
    defaults(defaults) {
      values = mergeConfig(defaults, values);
    },
    /** Слить значения поверх заданных. */
    override(overrides) {
      values = mergeConfig(values, overrides);
    },
  });
}
