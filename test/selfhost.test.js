'use strict';
// The committed pages are neutral and self-contained; config/site.conf, applied at
// image build, gives a deployment its own icons, footer and pdf.js address.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');
const pages = fs.readdirSync(pub).filter(f => f.endsWith('.html'));
const script = path.join(root, 'tools', 'apply-site-config.sh');
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));

function apply(conf) {
  const dir = tmp();
  for (const p of pages) fs.copyFileSync(path.join(pub, p), path.join(dir, p));
  const file = path.join(tmp(), 'site.conf');
  if (conf !== null) fs.writeFileSync(file, conf);
  return { dir, run: spawnSync('sh', [script, dir, file], { encoding: 'utf8' }) };
}
const same = dir => pages.every(p => read(dir, p) === read(pub, p));

test('as committed, no page loads or links anything from another host', () => {
  for (const p of pages) {
    const bad = [...read(pub, p).matchAll(/(?:href|src|action)="((?:https?:)?\/\/[^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(bad, [], p);
  }
  for (const f of fs.readdirSync(path.join(pub, 'scripts')))
    assert.doesNotMatch(read(path.join(pub, 'scripts'), f), /\b(fetch|importScripts|sendBeacon)\s*\(\s*['"`]|https?:\/\/[^\s'"]*\.m?js/, f);
});

test('every local file a page or the manifest names exists', () => {
  for (const p of pages)
    for (const m of read(pub, p).matchAll(/(?:href|src)="\/([^"?#]+)[^"]*"/g))
      assert.ok(fs.existsSync(path.join(pub, m[1])), `${p} -> ${m[1]}`);
  for (const i of JSON.parse(read(pub, 'brand/site.webmanifest')).icons) assert.ok(fs.existsSync(path.join(pub, i.src)), i.src);
  assert.ok(fs.existsSync(path.join(pub, 'vendor/pdfjs-3.11.174/pdf.worker.min.js')));
});

test('vendored pdf.js is the published build, with its licence, and eval is off', () => {
  const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(pub, 'vendor/pdfjs-3.11.174', f))).digest('hex');
  assert.equal(sha('pdf.min.js'), '5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946');
  assert.equal(sha('pdf.worker.min.js'), 'feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b');
  assert.match(read(pub, 'vendor/pdfjs-3.11.174/LICENSE'), /Apache License/);
  assert.match(read(pub, 'scripts/main.js'), /getDocument\(\{[^}]*isEvalSupported: false/);
});

test('no config file, or an empty one, changes nothing', () => {
  for (const c of [null, '', '# comment\n']) {
    const { dir, run } = apply(c);
    assert.equal(run.status, 0, run.stderr);
    assert.ok(same(dir));
  }
});

test('a config reaches every page, and nothing else on it', () => {
  const { dir, run } = apply('BRAND_BASE=https://example.com/b/\nFOOTER_NAME=Example Co\nFOOTER_URL=https://example.com\nPDFJS_BASE=https://cdn.example.com/p\n');
  assert.equal(run.status, 0, run.stderr);
  for (const p of pages) {
    const html = read(dir, p);
    for (const f of ['favicon.svg', 'apple-touch-icon.png', 'site.webmanifest']) assert.ok(html.includes(`href="https://example.com/b/${f}"`), `${p} ${f}`);
    assert.ok(html.includes('<a href="https://example.com" target="_blank" rel="noopener">Example Co</a>'), p);
    const back = html.replaceAll('https://example.com/b/', '/brand/')
      .replace('<a href="https://example.com" target="_blank" rel="noopener">Example Co</a>', '<a href="/">Octopus Tools</a>')
      .replace('src="https://cdn.example.com/p/pdf.min.js"', /src="\/vendor\/[^"]+"/.exec(read(pub, p))?.[0] || '');
    assert.equal(back, read(pub, p), p);
  }
  assert.ok(read(dir, 'speed-reader.html').includes('src="https://cdn.example.com/p/pdf.min.js"'));
});

test('a value that sed or HTML would interpret is refused, and half a footer too', () => {
  for (const c of ['FOOTER_NAME=a|b\nFOOTER_URL=/', 'FOOTER_NAME=<b>\nFOOTER_URL=/', 'BRAND_BASE=https://x/"y', 'BRAND_BASE=javascript:x',
    'BRAND_BASE=https://x/&', 'FOOTER_NAME=a\\b\nFOOTER_URL=/', 'FOOTER_NAME=only', 'FOOTER_URL=/only']) {
    const { dir, run } = apply(`${c}\n`);
    assert.equal(run.status, 1, c);
    assert.ok(same(dir), c);
  }
});

test('the config is data: a command in it is not run', () => {
  const mark = path.join(tmp(), 'ran');
  apply(`FOOTER_NAME=$(touch ${mark})\nFOOTER_URL=/\n`);
  assert.ok(!fs.existsSync(mark));
});

test('the image applies the config before it takes the build hash', () => {
  const df = read(root, 'Dockerfile');
  const at = df.indexOf('apply-site-config.sh /usr/share');
  assert.ok(at > 0 && at < df.indexOf('sha256sum'));
});

test('a committed site.conf is accepted by the script', t => {
  const f = path.join(root, 'config', 'site.conf');
  if (!fs.existsSync(f)) return t.skip('none in this copy');
  const { dir, run } = apply(fs.readFileSync(f, 'utf8'));
  assert.equal(run.status, 0, run.stderr);
  for (const p of pages) assert.doesNotMatch(read(dir, p), /"\/brand\//, p);
});

test('example compose binds to loopback and needs no outside network', () => {
  const y = read(root, 'docker-compose.example.yml');
  const ports = [...y.matchAll(/^\s+- "?([^"\n]+:80)"?$/gm)].map(m => m[1]);
  assert.ok(ports.length && ports.every(p => p.startsWith('127.0.0.1:')));
  assert.doesNotMatch(y, /external:/);
});
