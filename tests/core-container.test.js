import test from "node:test";
import assert from "node:assert/strict";
import { createContainer } from "../src/core/index.js";

test("компонент создаётся лениво и один раз", () => {
  const container = createContainer();
  let calls = 0;
  container.set("clock", () => ({ id: ++calls }));
  assert.equal(calls, 0);
  assert.equal(container.get("clock"), container.get("clock"));
  assert.equal(calls, 1);
});

test("shared:false даёт новый экземпляр при каждом get", () => {
  const container = createContainer();
  let calls = 0;
  container.set("tmp", { factory: () => ({ id: ++calls }), shared: false });
  assert.notEqual(container.get("tmp"), container.get("tmp"));
});

test("классы создаются с конфигурацией, зависимости приходят через inject", () => {
  const container = createContainer();
  class Store { constructor(config) { this.name = config.name; } }
  container.set("store", { class: Store, config: { name: "main" } });
  container.set("service", { factory: ({ store }) => ({ store }), inject: { store: "store" } });
  assert.equal(container.get("service").store.name, "main");
  assert.equal(container.get("service").store, container.get("store"));
});

test("голый класс определяется как класс, обычная функция — как фабрика", () => {
  const container = createContainer();
  class Thing { constructor() { this.kind = "class"; } }
  container.set("a", Thing);
  container.set("b", function () { return { kind: "factory" }; });
  assert.equal(container.get("a").kind, "class");
  assert.equal(container.get("b").kind, "factory");
});

test("круговая зависимость называет цепочку", () => {
  const container = createContainer();
  container.set("a", { factory: ({ b }) => b, inject: { b: "b" } });
  container.set("b", { factory: ({ a }) => a, inject: { a: "a" } });
  assert.throws(() => container.get("a"), /a → b → a/);
  // состояние разбора не залипает после ошибки
  container.set("c", { value: 1 });
  assert.equal(container.get("c"), 1);
});

test("неизвестный компонент, повторное определение после создания и неверное определение", () => {
  const container = createContainer();
  assert.throws(() => container.get("nope"), /не определён/);
  container.set("x", { value: 1 });
  container.get("x");
  assert.throws(() => container.set("x", { value: 2 }), /уже создан/);
  assert.throws(() => container.set("y", 42), /определение/);
});

test("алиас ведёт к компоненту; круговой алиас отклоняется", () => {
  const container = createContainer();
  container.set("real", { value: "ok" });
  container.alias("short", "real");
  assert.equal(container.get("short"), "ok");
  assert.equal(container.has("short"), true);
  container.alias("p", "q");
  container.alias("q", "p");
  assert.throws(() => container.get("p"), /круговой алиас/);
});

test("асинхронный компонент хранится как Promise и подгружается лениво", async () => {
  const container = createContainer();
  let loaded = 0;
  container.set("heavy", () => Promise.resolve({ ready: ++loaded }));
  assert.equal(loaded, 0);
  assert.deepEqual(await container.get("heavy"), { ready: 1 });
  assert.deepEqual(await container.get("heavy"), { ready: 1 });
});

test("dispose освобождает созданные компоненты в обратном порядке и собирает ошибки", async () => {
  const container = createContainer();
  const log = [];
  container.set("a", () => ({ dispose: () => log.push("a") }));
  container.set("b", () => ({ destroy: () => { log.push("b"); throw new Error("boom"); } }));
  container.set("c", () => ({ dispose: () => log.push("c") }));
  container.set("unused", () => ({ dispose: () => log.push("unused") }));
  container.get("a"); container.get("b"); container.get("c");
  await assert.rejects(container.dispose(), (error) => error instanceof AggregateError && error.errors.length === 1);
  assert.deepEqual(log, ["c", "b", "a"]);
  assert.throws(() => container.get("a"), /уничтожен/);
});
