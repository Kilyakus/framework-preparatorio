/**
 * Связывание паспортов с реализациями.
 *
 * Список модулей формирует приложение: каркас не обходит файловую систему.
 * Правило одно: реализация связывается только с зарегистрированным паспортом с
 * тем же `id`, остальные модули игнорируются. Благодаря этому код области не
 * может попасть в интерфейс без предварительно объявленного паспорта.
 */
export async function bindScopes(registry, loaders = []) {
  const bound = [];
  for (const load of loaders) {
    if (typeof load !== "function") continue;
    const module = await load();
    const scope = module?.default ?? module;
    if (!scope?.id || !registry.get(scope.id)) continue;
    registry.bind(scope);
    bound.push(scope.id);
  }
  return bound;
}
