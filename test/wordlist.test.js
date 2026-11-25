'use strict';
/**
 * The shipped words are EFF's file, byte for byte once the dice numbers are put
 * back. A count alone would pass a list with a word swapped.
 */
const { test } = require('node:test');
const assert   = require('node:assert');
const fs       = require('node:fs');
const path     = require('node:path');
const crypto   = require('node:crypto');

const root  = path.join(__dirname, '..');
const read  = f => fs.readFileSync(path.join(root, f), 'utf8');
const { WORDS } = require('../public/scripts/eff-wordlist.js');
const SHA256 = 'addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e';
const URL_   = 'https://www.eff.org/files/2016/07/18/eff_large_wordlist.txt';

test('7,776 words, all different, all lower case', () => {
  assert.equal(WORDS.length, 6 ** 5);
  assert.equal(new Set(WORDS).size, 6 ** 5);
  // EFF's list has four hyphenated words; they stay, because they are EFF's.
  for (const w of WORDS) assert.match(w, /^[a-z]+(-[a-z]+)?$/);
  assert.deepEqual(WORDS.filter(w => w.includes('-')), ['drop-down', 'felt-tip', 't-shirt', 'yo-yo']);
});

test('putting the dice numbers back reproduces the file EFF serves', () => {
  const dice = i => [...i.toString(6).padStart(5, '0')].map(d => +d + 1).join('');
  const file = WORDS.map((w, i) => `${dice(i)}\t${w}\n`).join('');
  assert.equal(crypto.createHash('sha256').update(file).digest('hex'), SHA256);
});

test('no word begins another, so the entropy holds with no separator or a hyphen', () => {
  const set = new Set(WORDS);
  for (const w of WORDS)
    for (let i = 1; i < w.length; i++) assert.ok(!set.has(w.slice(0, i)), `${w.slice(0, i)} begins ${w}`);
});

test('source, date, hash and licence are recorded, and EFF is credited on the page', () => {
  for (const f of ['public/scripts/eff-wordlist.js', 'THIRD-PARTY-NOTICES.md']) {
    const src = read(f);
    for (const s of [URL_, '2026-11-25', SHA256, 'https://creativecommons.org/licenses/by/4.0/', 'Joseph Bonneau'])
      assert.ok(src.includes(s), `${f} does not record ${s}`);
  }
  const page = read('public/password-generator.html');
  assert.match(page, /Electronic Frontier Foundation/);
  assert.match(page, /creativecommons\.org\/licenses\/by\/4\.0/);
  assert.doesNotMatch(page, /EFF short/);
});

test('the list is self-hosted: the page fetches nothing from eff.org', () => {
  const page = read('public/password-generator.html');
  assert.match(page, /<script src="\/scripts\/eff-wordlist\.js\?v=[0-9a-f]{8}"><\/script>/);
  assert.doesNotMatch(page, /src="https?:|fetch\(|XMLHttpRequest/);
});
