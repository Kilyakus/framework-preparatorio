/**
 * Шина событий приложения.
 *
 * Модули не вызывают друг друга напрямую: они подписываются на события
 * жизненного цикла (`module:bootstrapped`, `afterBootstrap`) и на собственные
 * события других модулей. Обработчики вызываются в порядке подписки; ошибка
 * одного не мешает остальным и сообщается после обхода всех.
 */
export function createEventBus() {
  const handlers = new Map();

  function on(name, handler, { once = false } = {}) {
    if (typeof name !== "string" || !name) throw new TypeError("Событие: нужно имя");
    if (typeof handler !== "function") throw new TypeError(`Событие ${name}: обработчик должен быть функцией`);
    const list = handlers.get(name) ?? [];
    list.push({ handler, once });
    handlers.set(name, list);
    return () => off(name, handler);
  }

  function off(name, handler) {
    const list = handlers.get(name);
    if (!list) return false;
    const index = list.findIndex((entry) => entry.handler === handler);
    if (index < 0) return false;
    list.splice(index, 1);
    if (!list.length) handlers.delete(name);
    return true;
  }

  const snapshot = (name) => {
    const list = [...(handlers.get(name) ?? [])];
    for (const entry of list.filter((item) => item.once)) off(name, entry.handler);
    return list.map((entry) => entry.handler);
  };

  function fail(name, errors) {
    if (!errors.length) return;
    if (errors.length === 1) throw errors[0];
    throw new AggregateError(errors, `Событие ${name}: ошибок обработчиков — ${errors.length}`);
  }

  return Object.freeze({
    on,
    off,
    once: (name, handler) => on(name, handler, { once: true }),
    has: (name) => (handlers.get(name)?.length ?? 0) > 0,
    /** Синхронная рассылка. */
    emit(name, payload) {
      const errors = [];
      for (const handler of snapshot(name)) {
        try {
          handler(payload, name);
        } catch (error) {
          errors.push(error);
        }
      }
      fail(name, errors);
    },
    /** Рассылка с ожиданием: обработчики выполняются последовательно. */
    async emitAsync(name, payload) {
      const errors = [];
      for (const handler of snapshot(name)) {
        try {
          await handler(payload, name);
        } catch (error) {
          errors.push(error);
        }
      }
      fail(name, errors);
    },
    clear: () => handlers.clear(),
  });
}
