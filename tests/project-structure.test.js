import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const path = name => new URL(`../${name}`, import.meta.url);

test('app and web sources follow the project structure and exported paths exist', () => {
  const pkg=JSON.parse(readFileSync(path('package.json'),'utf8'));
  for(const name of ['src/app/main.js','src/web/index.html','src/web/assets/js/main.js','src/web/assets/css/index.css','demo/main.js','docs/API.md','tests/project-structure.test.js'])
    assert.ok(existsSync(path(name)),`${name} exists`);
  for(const old of ['src/index.js','index.html','assets','styles'])assert.ok(!existsSync(path(old)),`${old} was moved`);
  assert.equal(pkg.exports['.'],'./src/app/main.js');
  for(const target of Object.values(pkg.exports))assert.ok(existsSync(path(target.slice(2))),`export ${target} exists`);
  assert.ok(pkg.files.includes('src') && pkg.files.includes('demo') && pkg.files.includes('docs'));
  assert.match(readFileSync(path('src/web/index.html'),'utf8'),/src="\/assets\/js\/main\.js"/);
  assert.match(readFileSync(path('src/web/assets/js/main.js'),'utf8'),/demo\/main\.js/);
});
