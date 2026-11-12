/**
 * Области: реестр и операции над текущим реестром.
 *
 * Реестр создаётся приложением, наполняется паспортами и назначается текущим
 * через `useScopeRegistry` до построения интерфейса. Дальнейшие вызовы
 * (`getScope`, `listScopes`, `mountScopes`) работают с назначенным реестром и не
 * требуют передачи его параметром.
 *
 * Назначение текущего реестра вместо параметра в каждом вызове: оболочка
 * обращается к составу областей из независимых модулей (док, меню, инструменты,
 * доступность элементов), и явная установка делает связь однократной и
 * проверяемой.
 */
import { createScopeRegistry, mountScopeNodes } from "./registry.js";

let current = createScopeRegistry();

/** Приложение назначает свой реестр один раз при загрузке. */
export function useScopeRegistry(registry) {
  if (!registry) throw new TypeError("useScopeRegistry: нужен реестр областей");
  current = registry;
  return current;
}

export const getScopeRegistry = () => current;
export const getScope = (id) => current.get(id) ?? null;
export const listScopes = () => current.list();
export const mountScopes = (root, options) => mountScopeNodes(current, root, options);

export { createScopeRegistry, mountScopeNodes } from "./registry.js";
export { createScopeAvailability, bindScopeDependencies } from "./dependencies.js";
export { bindScopes } from "./runtime.js";
