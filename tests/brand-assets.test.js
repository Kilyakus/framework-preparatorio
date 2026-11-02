import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('both supplied SVG marks use the studio palette and retain the original geometry', () => {
  for (const name of ['preparatorio','preparatorio-mark']) {
    const svg=read(`src/web/assets/images/${name}.svg`);
    assert.match(svg,/<svg\b[^>]*viewBox="0 0 256 256"/);
    assert.match(svg,/M69 61L130 26L191 61L156 81L130 66L104 81L69 61Z/);
    assert.match(svg,/M191 61V131L130 166V126L156 111V81L191 61Z/);
    assert.match(svg,/#4772B3/i);assert.match(svg,/#BDD4F0/i);
    assert.doesNotMatch(svg,/#7C3AED|#6D28D9|#A5F3FC/i);
  }
  assert.match(read('src/web/assets/images/preparatorio.svg'),/<rect\b/);
  assert.doesNotMatch(read('src/web/assets/images/preparatorio-mark.svg'),/<rect\b/);
});

test('library exports artwork, documented API and SVG-based demo icons', () => {
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'2.0.1');assert.equal(pkg.exports['./logo.svg'],'./src/web/assets/images/preparatorio.svg');assert.equal(pkg.exports['./mark.svg'],'./src/web/assets/images/preparatorio-mark.svg');
  assert.ok(pkg.files.includes('src')&&pkg.files.includes('docs'));
  const demo=read('demo/main.js');assert.match(demo,/brand:\{logo:mark\}/);assert.match(demo,/svgIcon\(treeIcons/);assert.doesNotMatch(demo,/<i>|demo-mark.*<b>|glyph:/);
  const readme=read('README.md');assert.match(readme,/v2\.0\.001/);assert.match(readme,/src\/web\/assets\/images\/preparatorio-mark\.svg/);assert.match(readme,/docs\/images\/demo\.png/);assert.doesNotMatch(readme,/morphia|lumino/i);
  for(const name of ['docs/images/demo.png','docs/API.md'])assert.ok(existsSync(new URL(`../${name}`,import.meta.url)));
});

test('MIT license is packaged and documented', () => {
  const pkg=JSON.parse(read('package.json'));
  const lock=JSON.parse(read('package-lock.json'));
  assert.equal(pkg.license,'MIT');assert.equal(lock.packages[''].license,'MIT');
  assert.ok(pkg.files.includes('LICENSE'));
  assert.match(read('LICENSE'),/^MIT License\n\nCopyright \(c\) 2026 Kilyakus/);
  assert.match(read('LICENSE'),/Permission is hereby granted, free of charge/);
  assert.match(read('README.md'),/\[MIT\]\(LICENSE\)/);
  assert.doesNotMatch(read('README.md'),/SemVer|ведущие нули|лицензия проекта пока не определена/i);
});
