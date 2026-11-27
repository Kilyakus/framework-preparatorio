import test from "node:test";
import assert from "node:assert/strict";
import { defineModule, resolveModuleOrder } from "../src/core/index.js";

const mod = (id, extra = {}) => defineModule({ id, version: "1.0.0", ...extra });

test("паспорт проверяется и замораживается", () => {
  const module = mod("alpha", { requires: ["beta"], params: { a: 1 } });
  assert.equal(Object.isFrozen(module), true);
  assert.deepEqual(module.requires, { beta: "*" });
  assert.throws(() => defineModule({ id: "Bad_ID", version: "1.0.0" }), /неверный id/);
  assert.throws(() => defineModule({ id: "a", version: "x" }), /Неверная версия/);
  assert.throws(() => defineModule({ id: "a", version: "1.0.0", bootstrap: 1 }), /bootstrap/);
  assert.throws(() => defineModule({ id: "a", version: "1.0.0", requires: ["a"] }), /сам модуль/);
  assert.throws(() => defineModule({ id: "a", version: "1.0.0", requires: { b: "^^" } }), /Неверный диапазон/);
  assert.throws(() => defineModule({ id: "a", version: "1.0.0", components: { "b.x": () => 1 } }), /должен называться/);
  assert.throws(() => defineModule({ id: "a", version: "1.0.0", scopes: { engines: {} } }), /массивом/);
});

test("компоненты модуля называются «<id>.<имя>»", () => {
  const module = mod("physio", { components: { physio: () => 1, "physio.engine": () => 2 } });
  assert.deepEqual(Object.keys(module.components), ["physio", "physio.engine"]);
});

test("зависимости раньше зависимых, остальное — в порядке конфигурации", () => {
  const modules = [mod("c", { requires: ["b"] }), mod("a"), mod("b", { requires: ["a"] }), mod("z")];
  assert.deepEqual(resolveModuleOrder(modules).map((m) => m.id), ["a", "b", "c", "z"]);
});

test("необязательная зависимость учитывается в порядке, если включена", () => {
  const modules = [mod("a", { optional: ["b"] }), mod("b")];
  assert.deepEqual(resolveModuleOrder(modules).map((m) => m.id), ["b", "a"]);
  assert.deepEqual(resolveModuleOrder([mod("a", { optional: ["b"] })]).map((m) => m.id), ["a"]);
});

test("ошибки совместимости собираются все сразу", () => {
  const modules = [
    mod("a", { requires: { b: "^2.0.0", missing: "*" } }),
    mod("b"),
    mod("c", { requires: ["off"] }),
  ];
  assert.throws(() => resolveModuleOrder(modules, { disabled: ["off"] }), (error) => {
    assert.match(error.message, /a: требует b \^2\.0\.0, подключена версия 1\.0\.0/);
    assert.match(error.message, /a: требует модуль «missing»/);
    assert.match(error.message, /c: требует отключённый модуль «off»/);
    return true;
  });
});

test("цикл называет путь, дубликат отклоняется", () => {
  const cycle = [mod("a", { requires: ["b"] }), mod("b", { requires: ["c"] }), mod("c", { requires: ["a"] })];
  assert.throws(() => resolveModuleOrder(cycle), /a → b → c → a/);
  assert.throws(() => resolveModuleOrder([mod("a"), mod("a")]), /Дубликат/);
});
