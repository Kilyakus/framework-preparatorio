import test from "node:test";
import assert from "node:assert/strict";
import { createApplication, defineModule, createScopeRegistry, hasScopeContributions, getViewContribution } from "../src/app/main.js";

const passport = (id, extra = {}) => Object.freeze({
  id, areaId: `${id}-area`, selector: `.${id}-area`, label: id, template: `<div class="${id}-area"></div>`, ...extra,
});
const mod = (id, extra = {}) => defineModule({ id, version: "1.0.0", ...extra });

test("hasScopeContributions: пусто без вкладов и настроек", () => {
  assert.equal(hasScopeContributions([mod("a")], {}), false);
  assert.equal(hasScopeContributions([mod("a", { scopes: { loaders: [() => ({})] } })], {}), true);
  assert.equal(hasScopeContributions([], { builtInScopes: { viewport3d: { enabled: true } } }), true);
});

test("модули приносят паспорта и реализации, приложение — порядок", async () => {
  const bound = [];
  const impl = (id) => () => Promise.resolve({ default: { ...passport(id), activate: () => { bound.push(id); } } });
  const registry = createScopeRegistry();
  const app = createApplication({
    scopes: { preferred: ["beta", "alpha"], contributions: false, current: false },
    modules: {
      alpha: mod("alpha", { scopes: { pluginScopes: [passport("alpha")], loaders: [impl("alpha")] } }),
      beta: mod("beta", { scopes: { pluginScopes: [passport("beta")], loaders: [impl("beta")] } }),
    },
  });
  await app.run();
  assert.deepEqual(app.scopes.registry.list().map((scope) => scope.id), ["beta", "alpha"]);
  assert.deepEqual(app.scopes.bound.sort(), ["alpha", "beta"]);
  assert.equal(typeof app.scopes.registry.get("alpha").activate, "function");
  assert.equal(app.get("scopes"), app.scopes);
  void registry;
});

test("движок-область из модуля связывается своим load()", async () => {
  const scope = passport("viewport");
  const engine = Object.freeze({
    id: "viewport", kind: "scope",
    plugins: { scopeDefinitions: [scope], loaders: [] },
    load: () => Promise.resolve({ default: { ...scope, activate: () => {} } }),
  });
  const app = createApplication({
    scopes: { contributions: false, current: false },
    modules: { render: mod("render", { scopes: { engines: [engine] } }) },
  });
  await app.run();
  assert.deepEqual(app.scopes.bound, ["viewport"]);
});

test("вклады меню регистрируются от имени модуля", async () => {
  const app = createApplication({
    scopes: { current: false },
    modules: {
      menu: mod("menu", {
        scopes: {
          pluginScopes: [passport("menu")],
          viewContributions: [{ id: "core-menu-item", label: "Пункт", selector: "#core-menu-item" }],
        },
      }),
    },
  });
  await app.run();
  assert.equal(getViewContribution("core-menu-item").owner, "menu");
});

test("без вкладов области не собираются и доступ к ним не ломает приложение", async () => {
  const app = createApplication({ modules: { a: mod("a") } });
  await app.run();
  assert.equal(app.scopes.composed, false);
  assert.throws(() => app.scopes.mount({}), /Сначала compose/);
});

test("повторная сборка и сбой связывания откатывают модули", async () => {
  const log = [];
  const app = createApplication({
    scopes: { contributions: false, current: false },
    modules: {
      a: mod("a", {
        scopes: { pluginScopes: [passport("a")], loaders: [() => { throw new Error("импорт не удался"); }] },
        dispose: () => log.push("down:a"),
      }),
    },
  });
  await assert.rejects(app.run(), /импорт не удался/);
  assert.deepEqual(log, ["down:a"]);
});
