/**
 * Порядок областей.
 *
 * Задаётся приложением: список `preferred` определяет очередность известных
 * областей, `order` в паспорте имеет приоритет над списком, остальные области
 * располагаются после по алфавиту. Такое правило даёт одинаковый результат в
 * любой сборке и не перемещает новые области в начало.
 */
/**
 * @param {string[]} preferred порядок id областей
 * @returns {{rank: (scope: object) => number, compare: (a: object, b: object) => number}}
 */
export function createScopeOrder(preferred = []) {
  if (!Array.isArray(preferred)) throw new TypeError("createScopeOrder: preferred должен быть массивом");
  const rank = (scope) => {
    if (scope?.order != null) return scope.order;
    const index = preferred.indexOf(scope?.id);
    return index < 0 ? 1000 : index;
  };
  return {
    rank,
    compare: (a, b) => rank(a) - rank(b) || String(a?.id).localeCompare(String(b?.id)),
  };
}
