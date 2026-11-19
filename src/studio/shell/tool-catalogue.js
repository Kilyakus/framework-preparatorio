/**
 * Каталог инструментов.
 *
 * Инструмент объявляется в паспорте области, поэтому каталог строится из
 * реестра, а не из отдельного списка. Сборка выполняется при вызове функции:
 * к этому моменту состав зарегистрированных областей уже определён.
 */
/**
 * @param {{list: () => object[]}} registry реестр областей
 * @param {{order?: (tool: object) => number}} [options]
 * @returns {{tools: ReadonlyArray<object>, byId: Record<string, object>, byScope: Record<string, object[]>}}
 */
export function createToolCatalogue(registry, { order } = {}) {
  if (!registry || typeof registry.list !== "function") throw new TypeError("createToolCatalogue: нужен реестр областей");
  const rank = order ?? ((tool) => tool.order ?? 10000);
  const tools = registry
    .list()
    .flatMap((scope) => (scope.tools ?? []).map((tool) => ({ ...tool, scope: scope.id })))
    .sort((a, b) => rank(a) - rank(b));
  const byId = Object.fromEntries(tools.map((tool) => [tool.id, tool]));
  const byScope = {};
  for (const tool of tools) (byScope[tool.scope] ??= []).push(tool);
  return Object.freeze({ tools: Object.freeze(tools), byId: Object.freeze(byId), byScope: Object.freeze(byScope) });
}
