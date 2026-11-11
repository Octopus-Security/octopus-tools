'use strict';
// No native alert/confirm/prompt in the pages or scripts; the vendored kit dialog is current.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pub = path.join(__dirname, '..', 'public');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const VENDORED = new Set(['scripts/kit-dialog.js', 'styles/kit-dialog.css']);

test('client code never calls native alert(), confirm() or prompt()', () => {
  const bad = [];
  for (const f of walk(pub).filter(f => /\.(html|js)$/.test(f))) {
    const rel = path.relative(pub, f);
    if (VENDORED.has(rel)) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (/(^|[^\w.$])(window\.)?(alert|confirm|prompt)\s*\(/.test(l)) bad.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(bad, []);
});

test('every page that uses oDialog loads the vendored kit script before it, and the css', () => {
  for (const f of walk(pub).filter(f => /\.(html|js)$/.test(f))) {
    const rel = path.relative(pub, f);
    if (VENDORED.has(rel)) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (!src.includes('oDialog.')) continue;
    // main.js is loaded by speed-reader.html; check the pages, not the script.
    const pages = rel.endsWith('.html') ? [[rel, src]] :
      fs.readdirSync(pub).filter(p => p.endsWith('.html')).map(p => [p, fs.readFileSync(path.join(pub, p), 'utf8')])
        .filter(([, h]) => h.includes('/' + rel));
    assert.ok(pages.length, `${rel} uses oDialog but no page loads it`);
    for (const [name, html] of pages) {
      const kit = html.indexOf('/scripts/kit-dialog.js'), own = html.indexOf(rel.endsWith('.html') ? 'oDialog.' : '/' + rel);
      assert.ok(kit >= 0 && kit < own, `${name}: kit-dialog.js must load before the code that uses it`);
      assert.match(html, /\/styles\/kit-dialog\.css/, `${name}: missing kit-dialog.css`);
    }
  }
});

test('vendored kit files carry a header that matches their bytes and the pinned tag', async () => {
  const { problems } = await import('../tools/kit-sync.mjs');
  assert.deepStrictEqual(problems(), []);
});
