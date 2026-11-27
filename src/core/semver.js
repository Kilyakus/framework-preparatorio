/**
 * Минимальная работа с версиями — ровно столько, сколько нужно модулям.
 *
 * Поддерживаются версии `X.Y.Z` (ведущие нули допустимы: каталоги проектов
 * подписываются как `1.1.031`) и диапазоны: `*`, точная версия, `^`, `~`,
 * `>`, `>=`, `<`, `<=`, `=` и несколько условий через пробел (`>=1.2.0 <2`).
 * Предрелизные метки не поддерживаются: версии модулей — три числа.
 */
const VERSION = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

/** @returns {[number, number, number]} */
export function parseVersion(text) {
  const match = VERSION.exec(String(text ?? "").trim());
  if (!match) throw new TypeError(`Неверная версия «${text}»: ожидается X.Y.Z`);
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function upperBound(kind, text) {
  const match = VERSION.exec(text);
  const [major, minor, patch] = parseVersion(text);
  const given = match.slice(1).filter((part) => part !== undefined).length;
  if (kind === "^") {
    if (major > 0 || given === 1) return [major + 1, 0, 0];
    if (minor > 0 || given === 2) return [0, minor + 1, 0];
    return [0, 0, patch + 1];
  }
  // "~": допускает правки в пределах младшей указанной части.
  return given === 1 ? [major + 1, 0, 0] : [major, minor + 1, 0];
}

function atLeast(version, bound) {
  return compareVersions(version, bound.join(".")) >= 0;
}

function below(version, bound) {
  return compareVersions(version, bound.join(".")) < 0;
}

function satisfiesComparator(version, comparator) {
  const match = /^(\^|~|>=|<=|>|<|=)?\s*(v?\d+(?:\.\d+){0,2})$/.exec(comparator);
  if (!match) throw new TypeError(`Неверный диапазон версий «${comparator}»`);
  const [, operator = "=", target] = match;
  const order = compareVersions(version, target);
  switch (operator) {
    case "^":
    case "~":
      return order >= 0 && below(version, upperBound(operator, target.replace(/^v/, "")));
    case ">=":
      return order >= 0;
    case "<=":
      return order <= 0;
    case ">":
      return order > 0;
    case "<":
      return order < 0;
    default:
      return order === 0;
  }
}

/** Удовлетворяет ли `version` диапазону `range` (условия через пробел — «И»). */
export function satisfies(version, range = "*") {
  parseVersion(version);
  const text = String(range).trim();
  if (text === "" || text === "*") return true;
  return text
    .replace(/(\^|~|>=|<=|>|<|=)\s+/g, "$1")
    .split(/\s+/)
    .every((comparator) => satisfiesComparator(version, comparator));
}
