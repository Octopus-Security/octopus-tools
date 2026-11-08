'use strict';
/**
 * typing.test.js — scoring, sessions, drills, weak keys, history.
 *
 * The scoring cases are worked by hand in the comments, so a reader can check
 * the arithmetic without running anything.
 */
const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('node:path');

const Typing = require(path.join('..', 'public', 'scripts', 'typing.js'));

const typeAll = (s, text, startAt = 0, gap = 100) => [...text].forEach((c, i) => s.press(c, startAt + i * gap));

// ── Scoring ──────────────────────────────────────────────────────────────────

test('WPM counts five characters as a word', () => {
  // 50 characters typed perfectly in exactly 60 s: 50 / 5 = 10 words in 1 minute.
  const target = 'a'.repeat(50);
  const s = Typing.createSession(target);
  for (let i = 0; i < 50; i++) s.press('a', i === 49 ? 60000 : i * 1000);      // first key at t=0, last at t=60000
  const st = s.stats();
  assert.equal(st.elapsedMs, 60000);
  assert.equal(st.wpm, 10);
  assert.equal(st.raw, 10);
  assert.equal(st.accuracy, 100);
  assert.equal(st.done, true);
});

test('raw WPM counts every keystroke; WPM only what is correct on screen; accuracy counts mistakes you fixed', () => {
  // Target "abcde" (5 chars). Type a, b, X (wrong), Backspace, c, d, e over 30 s.
  const s = Typing.createSession('abcde');
  s.press('a', 0); s.press('b', 5000); s.press('X', 10000); s.press('Backspace', 12000);
  s.press('c', 15000); s.press('d', 20000); s.press('e', 30000);
  const st = s.stats();
  assert.equal(st.keystrokes, 6);                       // a b X c d e: Backspace is not a keystroke
  assert.equal(st.errors, 1);
  assert.equal(st.backspaces, 1);
  assert.equal(st.accuracy, (5 / 6) * 100);             // the fixed mistake still counts against you
  assert.equal(st.wpm, (5 / 5) / 0.5);                  // 5 correct chars = 1 word in 0.5 min = 2 WPM
  assert.equal(st.raw, (6 / 5) / 0.5);                  // 2.4
});

test('a wrong character left on screen is not counted toward WPM', () => {
  const s = Typing.createSession('abcd');
  typeAll(s, 'abXd', 0, 15000);                          // 4 keystrokes, 45 s
  const st = s.stats();
  assert.equal(st.errors, 1);
  assert.equal(st.wpm, (3 / 5) / (45000 / 60000));
});

test('errors are tallied against the key that was EXPECTED', () => {
  const s = Typing.createSession('cat sat');
  typeAll(s, 'cxt sxt');
  const st = s.stats();
  assert.deepEqual(st.errorsPerKey.a, { n: 2, err: 2 });
  assert.deepEqual(st.errorsPerKey.c, { n: 1, err: 0 });
  assert.deepEqual(st.errorsPerKey.t, { n: 2, err: 0 });
});

test('capitals fold into their lower-case key in the tally', () => {
  const s = Typing.createSession('Aa');
  typeAll(s, 'aa');
  assert.deepEqual(s.stats().errorsPerKey.a, { n: 2, err: 1 });
});

test('Backspace on an empty box does nothing, and typing past the end is ignored', () => {
  const s = Typing.createSession('ab');
  s.press('Backspace', 0);
  assert.equal(s.started(), false);
  assert.equal(s.stats(0).accuracy, 100);               // no keystrokes: not a score of zero
  typeAll(s, 'ab', 10);
  assert.equal(s.press('c', 500), false);
  assert.equal(s.stats().keystrokes, 2);
});

test('the clock starts on the first key, not on creation', () => {
  const s = Typing.createSession('hello');
  assert.equal(s.stats(99999).elapsedMs, 0);
  s.press('h', 5000);
  assert.equal(s.stats(8000).elapsedMs, 3000);
});

test('a timed session stops counting at its limit', () => {
  const s = Typing.createSession('abcdefghij'.repeat(20), { limitMs: 15000 });
  s.press('a', 0); s.press('b', 5000);
  assert.equal(s.press('c', 16000), false, 'a key after the limit is not accepted');
  assert.equal(s.isDone(), true);
  const st = s.stats(60000);
  assert.equal(st.elapsedMs, 15000);
  assert.equal(st.wpm, (2 / 5) / 0.25);                  // 2 correct chars over a quarter minute
});

// ── Code mode ────────────────────────────────────────────────────────────────

test('Tab types four spaces and Enter a newline in code mode', () => {
  const target = 'if x:\n    return 1';
  const s = Typing.createSession(target, { code: true });
  typeAll(s, 'if x:');
  s.press('Enter', 1000); s.press('Tab', 1100);
  typeAll(s, 'return 1', 1200);
  const st = s.stats();
  assert.equal(st.done, true);
  assert.equal(st.errors, 0);
  assert.equal(s.typed().join(''), target);
});

test('Tab and Enter are ignored in prose mode instead of counting as mistakes', () => {
  const s = Typing.createSession('ab cd');
  assert.equal(s.press('Tab', 0), false);
  assert.equal(s.press('Enter', 1), false);
  assert.equal(s.started(), false);
  assert.equal(s.stats().errors, 0);
});

test('a Tab that would run past the end is cut off, not overflowed', () => {
  const s = Typing.createSession('ab  ', { code: true });
  typeAll(s, 'ab');
  s.press('Tab', 500);
  assert.equal(s.typed().length, 4);
  assert.equal(s.isDone(), true);
});

test('modifier and function keys are ignored', () => {
  const s = Typing.createSession('abc');
  for (const k of ['Shift', 'Control', 'ArrowLeft', 'F5', 'CapsLock', 'Dead']) assert.equal(s.press(k, 0), false);
  assert.equal(s.started(), false);
});

// ── Material ─────────────────────────────────────────────────────────────────

test('word list and snippets are well formed', () => {
  assert.ok(Typing.WORDS.length >= 300);
  assert.equal(new Set(Typing.WORDS).size, Typing.WORDS.length, 'duplicate words');
  assert.ok(Typing.WORDS.every(w => /^[a-z]+$/.test(w)), 'a word has a non-letter in it');
  for (const lang of ['python', 'javascript', 'shell']) {
    assert.ok(Typing.SNIPPETS[lang].length >= 5, `${lang} has too few snippets`);
    for (const s of Typing.SNIPPETS[lang]) {
      assert.ok(s.title && s.code, `${lang}: missing title or code`);
      assert.ok(!/\t/.test(s.code), `${s.title}: a tab character cannot be typed with Tab = 4 spaces`);
      assert.ok(!/\n$/.test(s.code) && !/ $/m.test(s.code), `${s.title}: trailing whitespace is untypeable by eye`);
      for (const line of s.code.split('\n')) {
        const lead = /^ */.exec(line)[0].length;
        assert.equal(lead % 4, 0, `${s.title}: indent of ${lead} is not a multiple of 4`);
      }
    }
  }
  // They exist to practise brackets, colons and indentation.
  const py = Typing.SNIPPETS.python.map(s => s.code).join('\n');
  assert.match(py, /:\n {4}/);
  assert.match(py, /\[.*\]/);
  assert.match(Typing.SNIPPETS.javascript.map(s => s.code).join('\n'), /\{\n {4}/);
});

test('every snippet can be typed perfectly with the keys the session accepts', () => {
  for (const lang of Object.keys(Typing.SNIPPETS)) for (const snip of Typing.SNIPPETS[lang]) {
    const s = Typing.createSession(snip.code, { code: true });
    let t = 0;
    for (const line of snip.code.split('\n').map((l, i, a) => l + (i < a.length - 1 ? '\n' : ''))) {
      const m = /^( *)(.*?)(\n?)$/.exec(line);
      for (let n = 0; n < m[1].length / 4; n++) s.press('Tab', t += 50);
      for (const c of m[2]) s.press(c, t += 50);
      if (m[3]) s.press('Enter', t += 50);
    }
    const st = s.stats();
    assert.equal(st.errors, 0, `${lang}/${snip.title}`);
    assert.equal(st.done, true, `${lang}/${snip.title} did not finish`);
  }
});

test('lessons build up: each lesson contains every key of the one before, within its family', () => {
  const ids = Typing.LESSONS.map(l => l.id);
  assert.deepEqual(ids.slice(0, 4), ['home', 'home2', 'top', 'bottom']);
  const keys = id => new Set(Typing.lessonById(id).keys);
  for (const [a, b] of [['home', 'home2'], ['home2', 'top'], ['top', 'bottom']])
    for (const k of keys(a)) assert.ok(keys(b).has(k), `${b} lost ${k} from ${a}`);
  assert.equal(Typing.lessonById('nope'), null);
});

test('lesson drills only use the lesson\'s keys, and always include the new ones', () => {
  for (const l of Typing.LESSONS.filter(l => l.keys)) {
    const rng = Typing.seeded(42);
    const text = Typing.lessonDrill(l, 60, rng);
    const allowed = new Set([...l.keys, ' ']);
    for (const c of text) assert.ok(allowed.has(c), `${l.id}: "${c}" is outside the lesson`);
    assert.ok([...l.newKeys].some(k => text.includes(k)), `${l.id}: none of the new keys appear`);
    assert.equal(text.split(' ').length, 60);
  }
});

test('the home-row drill is typeable on the home row: no other letters', () => {
  const text = Typing.lessonDrill(Typing.lessonById('home'), 50, Typing.seeded(7));
  assert.match(text, /^[asdfjkl; ]+$/);
});

test('the bracket lesson is whole fragments with real brackets in them', () => {
  const text = Typing.lessonDrill(Typing.lessonById('brackets'), 80, Typing.seeded(3));
  assert.match(text, /[()]/);
  assert.match(text, /[[\]]/);
  assert.match(text, /[{}]/);
});

test('seeded randomness repeats', () => {
  assert.equal(Typing.randomWords(10, Typing.seeded(5)).join(' '), Typing.randomWords(10, Typing.seeded(5)).join(' '));
  assert.notEqual(Typing.randomWords(10, Typing.seeded(5)).join(' '), Typing.randomWords(10, Typing.seeded(6)).join(' '));
});

test('random words do not repeat back to back and respect the count', () => {
  const w = Typing.randomWords(500, Typing.seeded(1));
  assert.equal(w.length, 500);
  for (let i = 1; i < w.length; i++) assert.notEqual(w[i], w[i - 1]);
});

// ── Weak keys ────────────────────────────────────────────────────────────────

test('weak keys rank by error rate and ignore keys with too few presses', () => {
  const table = { a: { n: 100, err: 1 }, s: { n: 20, err: 10 }, q: { n: 3, err: 3 }, ';': { n: 40, err: 8 }, e: { n: 50, err: 0 }, ' ': { n: 90, err: 30 } };
  const w = Typing.weakKeys(table);
  assert.deepEqual(w.map(x => x.key), ['s', ';', 'a']);        // q: too few presses; e: no errors; space: not a key to drill
  assert.equal(w[0].rate, 0.5);
});

test('merging a session into the table adds up and skips newlines', () => {
  const table = { a: { n: 4, err: 1 } };
  Typing.mergeKeys(table, { a: { n: 6, err: 2 }, b: { n: 1, err: 0 }, '\n': { n: 5, err: 5 } });
  assert.deepEqual(table, { a: { n: 10, err: 3 }, b: { n: 1, err: 0 } });
});

test('a weak-key drill leans on the weak keys, and refuses when there is nothing to go on', () => {
  assert.equal(Typing.weakDrill({}, 20).ok, false);
  const d = Typing.weakDrill({ z: { n: 20, err: 10 }, ';': { n: 20, err: 9 } }, 40, Typing.seeded(2));
  assert.equal(d.ok, true);
  assert.equal(d.text.split(' ').length, 40);
  const hits = d.text.split(' ').filter(t => t.includes('z') || t.includes(';')).length;
  assert.ok(hits >= 30, `only ${hits}/40 tokens contain a weak key`);
});

// ── History ──────────────────────────────────────────────────────────────────

function memStorage() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m };
}

test('history survives a save and a load', () => {
  const st = memStorage();
  const data = Typing.emptyStore();
  const s = Typing.createSession('ab cd');
  typeAll(s, 'ab cd', 0, 2000);
  Typing.record(data, 'time-30', s.stats(), 1000);
  assert.equal(Typing.save(st, data), true);
  const back = Typing.load(st);
  assert.equal(back.results.length, 1);
  assert.equal(back.results[0].bucket, 'time-30');
  assert.equal(back.keys.a.n, 1);
});

test('storage that throws, is missing, or holds junk never breaks anything', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(Typing.load(throwing), Typing.emptyStore());
  assert.equal(Typing.save(throwing, Typing.emptyStore()), false);
  assert.deepEqual(Typing.load(null), Typing.emptyStore());
  assert.equal(Typing.save(null, Typing.emptyStore()), false);
  assert.deepEqual(Typing.load({ getItem: () => '{not json' }), Typing.emptyStore());
  assert.deepEqual(Typing.load({ getItem: () => '{"results":"x","keys":5}' }), Typing.emptyStore());
});

test('history is capped, and the personal-best curve only ever goes up', () => {
  const data = Typing.emptyStore();
  const fake = w => ({ wpm: w, raw: w, accuracy: 97, errors: 1, elapsedMs: 30000, errorsPerKey: {} });
  [30, 25, 41, 38, 50, 12].forEach((w, i) => Typing.record(data, 'time-30', fake(w), i));
  Typing.record(data, 'words-25', fake(99), 9);
  const series = Typing.bestSeries(data, 'time-30');
  assert.deepEqual(series.map(p => p.best), [30, 30, 41, 41, 50, 50]);
  assert.deepEqual(series.map(p => p.wpm), [30, 25, 41, 38, 50, 12]);
  assert.equal(Typing.bests(data)['time-30'].wpm, 50);
  assert.equal(Typing.bests(data)['words-25'].wpm, 99);
  for (let i = 0; i < 600; i++) Typing.record(data, 'x', fake(i % 7), i);
  assert.equal(data.results.length, 500);
});

test('a lesson passes only when finished at 95% accuracy or better', () => {
  assert.equal(Typing.lessonPassed({ done: true, accuracy: 95 }), true);
  assert.equal(Typing.lessonPassed({ done: true, accuracy: 94.9 }), false);
  assert.equal(Typing.lessonPassed({ done: false, accuracy: 100 }), false);
});
