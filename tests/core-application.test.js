import test from "node:test";
import assert from "node:assert/strict";
import { createApplication, defineModule, createApplicationFrom, FRAMEWORK_VERSION } from "../src/core/index.js";
import { readFileSync } from "node:fs";

const mod = (id, extra = {}) => defineModule({ id, version: "1.0.0", ...extra });

test("версия каркаса в коде совпадает с package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(FRAMEWORK_VERSION, pkg.version);
});

test("жизненный цикл: порядок запуска по зависимостям, обратный порядок остановки", async () => {
  const log = [];
  const make = (id, requires = []) => mod(id, {
    requires,
    bootstrap: async () => { log.push(`up:${id}`); },
    dispose: async () => { log.push(`down:${id}`); },
  });
  const app = createApplication({
    modules: { c: make("c", ["b"]), b: make("b", ["a"]), a: make("a") },
    bootstrap: [() => log.push("app-bootstrap")],
  });
  assert.equal(app.state, "created");
  await app.run();
  assert.equal(app.state, "bootstrapped");
  assert.deepEqual(app.modules.map((m) => m.id), ["a", "b", "c"]);
  assert.deepEqual(log, ["up:a", "up:b", "up:c", "app-bootstrap"]);
  await app.dispose();
  assert.equal(app.state, "disposed");
  assert.deepEqual(log.slice(4), ["down:c", "down:b", "down:a"]);
});

test("init и bootstrap выполняются один раз, run вызывает main с приложением", async () => {
  let boots = 0;
  const app = createApplication({ modules: { a: mod("a", { bootstrap: () => { boots += 1; } }) } });
  await Promise.all([app.bootstrap(), app.bootstrap(), app.init()]);
  assert.equal(boots, 1);
  assert.equal(await app.run((instance) => instance.id), "app");
});

test("записи модулей: загрузчик, динамический импорт, обёртка, отключение", async () => {
  const dynamic = await import("data:text/javascript,export default {id:'dyn',version:'2.0.0'}");
  const app = createApplication({
    modules: {
      lazy: async () => mod("lazy"),
      dyn: () => import("data:text/javascript,export default {id:'dyn',version:'2.0.0'}"),
      wrapped: { module: mod("wrapped"), params: { x: 1 } },
      off: { module: () => { throw new Error("не должен загружаться"); }, enabled: false },
    },
  });
  void dynamic;
  await app.init();
  assert.deepEqual(app.modules.map((m) => m.id), ["lazy", "dyn", "wrapped"]);
  assert.equal(app.isEnabled("off"), false);
  assert.throws(() => app.module("off"), /не подключён/);
});

test("ключ в конфигурации должен совпадать с id паспорта; паспорт обязателен", async () => {
  await assert.rejects(createApplication({ modules: { a: mod("b") } }).init(), /называется «b»/);
  await assert.rejects(createApplication({ modules: { a: () => ({ nothing: true }) } }).init(), /не получен паспорт/);
});

test("несовместимая версия каркаса отклоняется", async () => {
  const app = createApplication({ modules: { a: mod("a", { framework: ">=9.0.0" }) } });
  await assert.rejects(app.init(), /требует каркас >=9\.0\.0/);
  const old = createApplication({ modules: { a: mod("a", { framework: ">=1.4.0 <2" }) } }, { frameworkVersion: "1.3.3" });
  await assert.rejects(old.init(), /подключён 1\.3\.3/);
});

test("параметры: модуль по умолчанию < params приложения < params записи", async () => {
  const app = createApplication({
    params: { physio: { gravity: -5 } },
    modules: {
      physio: { module: mod("physio", { params: { gravity: -9.8, substeps: 4 } }) },
      evolvia: { module: mod("evolvia", { params: { cache: true, quality: "high" } }), params: { quality: "low" } },
    },
  });
  await app.init();
  assert.equal(app.params.get("physio.gravity"), -5);
  assert.equal(app.params.get("physio.substeps"), 4);
  assert.equal(app.params.get("evolvia.cache"), true);
  assert.equal(app.params.get("evolvia.quality"), "low");
});

test("компоненты: приложение переопределяет запись модуля, запись — модуль", async () => {
  const app = createApplication({
    components: { "physio.engine": { value: "app" } },
    modules: {
      physio: {
        module: mod("physio", { components: { "physio.engine": { value: "module" }, "physio.world": { value: "module-world" } } }),
        components: { "physio.world": { value: "entry-world" } },
      },
      animio: mod("animio", { components: { "animio.engine": ({}, container) => ({ engine: container.get("physio.engine") }) } }),
    },
  });
  await app.init();
  assert.equal(app.get("physio.engine"), "app");
  assert.equal(app.get("physio.world"), "entry-world");
  assert.equal(app.get("animio.engine").engine, "app");
  assert.equal(app.get("app"), app);
  assert.equal(app.get("params"), app.params);
});

test("события жизненного цикла приходят по порядку", async () => {
  const log = [];
  const app = createApplication({ modules: { a: mod("a") } });
  for (const name of ["beforeInit", "afterInit", "beforeBootstrap", "module:bootstrapped", "afterBootstrap", "beforeDispose", "afterDispose"]) {
    app.on(name, (payload) => log.push(name === "module:bootstrapped" ? `${name}:${payload.id}` : name));
  }
  await app.run();
  await app.dispose();
  assert.deepEqual(log, ["beforeInit", "afterInit", "beforeBootstrap", "module:bootstrapped:a", "afterBootstrap", "beforeDispose", "afterDispose"]);
});

test("сбой bootstrap откатывает уже запущенные модули и сообщает имя модуля", async () => {
  const log = [];
  const app = createApplication({
    modules: {
      a: mod("a", { bootstrap: () => log.push("up:a"), dispose: () => log.push("down:a") }),
      b: mod("b", { requires: ["a"], bootstrap: () => { throw new Error("нет WebGL"); }, dispose: () => log.push("down:b") }),
    },
  });
  await assert.rejects(app.bootstrap(), /Модуль b: ошибка bootstrap — нет WebGL/);
  assert.deepEqual(log, ["up:a", "down:a"]);
  assert.equal(app.state, "initialized");
});

test("шаги bootstrap приложения: id компонента создаётся, неверный шаг отклоняется", async () => {
  let created = false;
  const app = createApplication({ components: { warm: () => { created = true; return {}; } }, bootstrap: ["warm"] });
  await app.run();
  assert.equal(created, true);
  await assert.rejects(createApplication({ bootstrap: [42] }).run(), /шаг/);
});

test("dispose освобождает созданные компоненты, ошибки не теряются", async () => {
  const log = [];
  const app = createApplication({
    components: { a: () => ({ dispose: () => log.push("a") }), b: () => ({ dispose: () => { throw new Error("b failed"); } }) },
    bootstrap: ["a", "b"],
    modules: { m: mod("m", { dispose: () => log.push("m") }) },
  });
  await app.run();
  await assert.rejects(app.dispose(), (error) => error instanceof AggregateError && /b failed/.test(error.errors[0].message));
  assert.deepEqual(log, ["m", "a"]);
  assert.equal(app.state, "disposed");
});

test("createApplicationFrom сливает источники конфигурации (основной + локальный)", async () => {
  const app = await createApplicationFrom([
    { id: "studio", params: { a: { x: 1, y: 1 } } },
    ({ env }) => ({ params: { a: { y: env === "dev" ? 2 : 3 } } }),
  ], { env: "dev" });
  await app.init();
  assert.equal(app.id, "studio");
  assert.equal(app.params.get("a.x"), 1);
  assert.equal(app.params.get("a.y"), 2);
});
