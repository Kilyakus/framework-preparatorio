import test from "node:test";
import assert from "node:assert/strict";
import { mergeConfig, loadConfig, createParams, createEventBus, parseVersion, compareVersions, satisfies } from "../src/core/index.js";

test("mergeConfig сливает объекты глубоко, массивы заменяет, null сбрасывает", () => {
  const merged = mergeConfig(
    { a: { x: 1, y: 2 }, list: [1, 2], keep: 1 },
    { a: { y: 3 }, list: [9], keep: undefined },
    { drop: null },
  );
  assert.deepEqual(merged, { a: { x: 1, y: 3 }, list: [9], keep: 1, drop: null });
});

test("mergeConfig не делит вложенные объекты с источниками", () => {
  const source = { a: { b: 1 } };
  const merged = mergeConfig(source);
  merged.a.b = 2;
  assert.equal(source.a.b, 1);
  assert.throws(() => mergeConfig("text"), /простым объектом/);
});

test("loadConfig принимает объект, функцию, промис, модуль и массив источников", async () => {
  assert.deepEqual(await loadConfig({ a: 1 }), { a: 1 });
  assert.deepEqual(await loadConfig(async ({ env }) => ({ env })), {});
  assert.deepEqual(await loadConfig((context) => ({ env: context.env }), { env: "dev" }), { env: "dev" });
  assert.deepEqual(await loadConfig(import("data:text/javascript,export default {fromModule:true}")), { fromModule: true });
  assert.deepEqual(await loadConfig(import("data:text/javascript,export default () => ({lazy:1})")), { lazy: 1 });
  assert.deepEqual(await loadConfig([{ a: { x: 1 } }, () => ({ a: { y: 2 } }), null]), { a: { x: 1, y: 2 } });
  await assert.rejects(loadConfig(() => 42), /простой объект/);
});

test("параметры: значения по умолчанию слабее заданных, override — сильнее", () => {
  const params = createParams({ physio: { gravity: -9.8 } });
  params.defaults({ physio: { gravity: -1, substeps: 4 }, evolvia: { cache: true } });
  assert.equal(params.get("physio.gravity"), -9.8);
  assert.equal(params.get("physio.substeps"), 4);
  params.override({ evolvia: { cache: false } });
  assert.equal(params.get("evolvia.cache"), false);
  assert.equal(params.get("missing.deep", "fallback"), "fallback");
  assert.equal(params.has("physio.substeps"), true);
  assert.equal(params.has("physio.none"), false);
  params.all().physio.gravity = 0;
  assert.equal(params.get("physio.gravity"), -9.8);
});

test("шина событий: порядок, once, отписка и сбор ошибок", async () => {
  const bus = createEventBus();
  const log = [];
  bus.on("e", () => log.push("a"));
  const off = bus.on("e", () => log.push("b"));
  bus.once("e", () => log.push("once"));
  bus.emit("e");
  bus.emit("e");
  assert.deepEqual(log, ["a", "b", "once", "a", "b"]);
  off();
  bus.emit("e");
  assert.equal(log.at(-1), "a");
  bus.on("bad", () => { throw new Error("one"); });
  bus.on("bad", () => log.push("after-error"));
  assert.throws(() => bus.emit("bad"), /one/);
  assert.equal(log.at(-1), "after-error");
  bus.on("async", async () => { await null; log.push("async1"); });
  bus.on("async", () => log.push("async2"));
  await bus.emitAsync("async");
  assert.deepEqual(log.slice(-2), ["async1", "async2"]);
  assert.throws(() => bus.on("", () => {}), /имя/);
  assert.throws(() => bus.on("x", null), /функцией/);
});

test("версии: разбор с ведущими нулями и сравнение", () => {
  assert.deepEqual(parseVersion("1.1.031"), [1, 1, 31]);
  assert.equal(compareVersions("1.1.031", "1.1.31"), 0);
  assert.equal(compareVersions("0.3.1", "0.10.0"), -1);
  assert.throws(() => parseVersion("1.x"), /Неверная версия/);
});

test("диапазоны версий", () => {
  const cases = [
    ["1.4.0", "^1.3.0", true], ["2.0.0", "^1.3.0", false], ["1.2.9", "^1.3.0", false],
    ["0.3.5", "^0.3.0", true], ["0.4.0", "^0.3.0", false], ["0.0.4", "^0.0.3", false],
    ["1.2.9", "~1.2.3", true], ["1.3.0", "~1.2.3", false],
    ["1.4.0", ">=1.4.0", true], ["1.3.9", ">=1.4.0", false], ["1.4.0", ">1.4.0", false],
    ["1.4.0", ">=1.2.0 <2", true], ["2.0.0", ">=1.2.0 <2", false], ["1.4.0", ">= 1.2.0", true],
    ["3.0.0", "*", true], ["3.0.0", "", true], ["1.0.0", "1.0.0", true], ["1.0.1", "=1.0.0", false],
  ];
  for (const [version, range, expected] of cases) assert.equal(satisfies(version, range), expected, `${version} ${range}`);
  assert.throws(() => satisfies("1.0.0", "^^1"), /Неверный диапазон/);
});
