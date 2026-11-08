'use strict';
/**
 * typing.js — the typing trainer's brains: word lists, lessons, drills, the
 * keystroke session, scoring and the history store.
 *
 * Pure: no DOM, no network, no globals beyond one export. typing.html is a thin
 * layer over it, and test/typing.test.js requires it directly. A classic script
 * for the reason at the top of bases.js (a static import would not carry the
 * ?v= stamp and would go stale behind Cloudflare).
 *
 * Everything below — the word list, the snippets, the lesson order — was written
 * for this repo. Nothing is lifted from another typing site.
 *
 * Scoring, spelled out because every typing site means something slightly
 * different by these words:
 *   WPM       (correct characters left on screen / 5) / minutes. Five characters
 *             make a "word", so a long word counts for more than a short one.
 *   Raw WPM   (every keystroke, right or wrong / 5) / minutes.
 *   Accuracy  correct keystrokes / all keystrokes. A mistake you fix with
 *             Backspace still counts as a mistake: you made it.
 *   Errors    per EXPECTED key, counted when the wrong key is pressed.
 */
(function (global) {

  // ── Material ───────────────────────────────────────────────────────────────

  const WORDS = ('able above across add after again air all almost alone along always and animal answer any ' +
    'around ask away back bad bag ball bank bare base bear beat bed begin bell best bird bit black blue boat body ' +
    'book both box brain break bring brown build burn busy buy call calm camp card care carry case cat cause ' +
    'chair change check child city clean clear clock close cloud coat cold color come cook cool copy corner cost ' +
    'could count course cover crowd cup dark data day deep desk dig dinner dish do dog door down draw dream dress ' +
    'drink drive drop dry dust each early earth east easy eat edge egg end enjoy enough even evening every eye ' +
    'face fact fair fall far farm fast few field fill find fine finger fire first fish five fix flag floor flow ' +
    'fly fold food foot force forest form found four free fresh friend from front fruit full game garden gate ' +
    'gift give glass go gold good grain grass great green group grow guess hair half hall hand happy hard hat ' +
    'head hear heart heavy help here high hill hold hole home hope horse hot hour house idea inch iron island ' +
    'join jump keep key kind king kitchen knee know lake land large last late laugh lead learn leave left less ' +
    'letter life light line list little live long look loud love low lunch main make many map mark match may ' +
    'meal meet metal middle mile milk mind mine minute miss money month moon more morning mountain move much ' +
    'music name near neck need never new next night noise north nose note number ocean often old once only open ' +
    'order other over page paint pair paper park part pass path peace pen people piece place plan plant play ' +
    'point pool port power press pull push put quick quiet rain reach read ready real rest rice rich ride right ' +
    'ring river road rock room root round row rule run safe salt same sand save say school sea seat seed seem ' +
    'sell send set shape sharp shelf shine ship shirt shop short show side sign silver simple sing sit size skin ' +
    'sleep slow small smell smile snow soft soil some song soon sound south space speak speed spend spring ' +
    'square stand star start stay steel step stick stone stop store storm story street strong study sugar ' +
    'summer sun sure sweet swim table tail take talk tall tea teach tell ten test thank thick thin think thread ' +
    'throw time tiny today together tone tool top town train tree trip true turn twin under until up use usual ' +
    'valley very village voice wait walk wall warm wash watch water wave way weather week west wheel white wide ' +
    'wild wind window winter wire wish wood word work world write year yellow young zero zone').split(' ');

  /** Hand-written snippets. Four-space indents throughout, so Tab (= 4 spaces) always lines up. */
  const SNIPPETS = {
    python: [
      { title: 'Sum the evens', code:
        'def sum_evens(numbers):\n    total = 0\n    for n in numbers:\n        if n % 2 == 0:\n            total += n\n    return total' },
      { title: 'Count words', code:
        'def count_words(text):\n    counts = {}\n    for word in text.lower().split():\n        counts[word] = counts.get(word, 0) + 1\n    return counts' },
      { title: 'Safe divide', code:
        'def safe_divide(a, b):\n    try:\n        return a / b\n    except ZeroDivisionError:\n        return None' },
      { title: 'Squares comprehension', code:
        'squares = [n * n for n in range(10) if n != 5]\nlookup = {name: len(name) for name in ["ada", "grace", "linus"]}\nprint(squares[-1], lookup["grace"])' },
      { title: 'A small class', code:
        'class Counter:\n    def __init__(self, start=0):\n        self.value = start\n\n    def bump(self, step=1):\n        self.value += step\n        return self.value' },
      { title: 'Read a file', code:
        'with open("notes.txt") as handle:\n    lines = [line.strip() for line in handle]\nprint(f"{len(lines)} lines, first: {lines[0]!r}")' }
    ],
    javascript: [
      { title: 'Unique values', code:
        'function unique(items) {\n    const seen = new Set();\n    for (const item of items) {\n        seen.add(item);\n    }\n    return [...seen];\n}' },
      { title: 'Arrow and map', code:
        'const prices = [4.5, 12, 7.25];\nconst withTax = prices.map((p) => +(p * 1.08).toFixed(2));\nconsole.log(withTax.filter((p) => p > 5));' },
      { title: 'Async fetch', code:
        'async function load(url) {\n    const res = await fetch(url);\n    if (!res.ok) {\n        throw new Error(`HTTP ${res.status}`);\n    }\n    return res.json();\n}' },
      { title: 'Object tally', code:
        'const tally = {};\nfor (const ch of "mississippi") {\n    tally[ch] = (tally[ch] || 0) + 1;\n}\nconsole.log(Object.entries(tally));' },
      { title: 'Debounce', code:
        'function debounce(fn, wait) {\n    let timer = null;\n    return (...args) => {\n        clearTimeout(timer);\n        timer = setTimeout(() => fn(...args), wait);\n    };\n}' },
      { title: 'Destructuring', code:
        'const { name, tags = [] } = record;\nconst [first, ...rest] = tags;\nif (name && first !== undefined) {\n    console.log(`${name}: ${first} (+${rest.length})`);\n}' }
    ],
    shell: [
      { title: 'Loop over files', code:
        'for file in *.log; do\n    lines=$(wc -l < "$file")\n    echo "$file: $lines lines"\ndone' },
      { title: 'Guard a directory', code:
        'if [ ! -d "$HOME/backup" ]; then\n    mkdir -p "$HOME/backup"\nfi\ncp -r ./notes "$HOME/backup/"' },
      { title: 'Pipeline', code:
        'grep -i "error" app.log | sort | uniq -c | sort -rn | head -n 5' },
      { title: 'Strict script header', code:
        '#!/usr/bin/env bash\nset -euo pipefail\nname="${1:-world}"\necho "hello, ${name}" >&2' },
      { title: 'Find and count', code:
        'find . -type f -name "*.txt" -mtime -7 | wc -l\nchmod 640 report.txt && ls -l report.txt' },
      { title: 'Case statement', code:
        'case "$1" in\n    start) echo "starting" ;;\n    stop)  echo "stopping" ;;\n    *)     echo "usage: $0 {start|stop}" ;;\nesac' }
    ]
  };

  // Ordered so every lesson adds a little to the one before it.
  const LESSONS = [
    { id: 'home',     title: 'Home row',            keys: 'asdfjkl;',                 newKeys: 'asdfjkl;', blurb: 'Fingers rest on a s d f and j k l ; — everything else is measured from here.' },
    { id: 'home2',    title: 'Home row, reaching',  keys: 'asdfghjkl;',               newKeys: 'gh',       blurb: 'Index fingers stretch to g and h.' },
    { id: 'top',      title: 'Top row',             keys: 'asdfghjkl;qwertyuiop',     newKeys: 'qwertyuiop', blurb: 'Reach up and come straight back to the home row.' },
    { id: 'bottom',   title: 'Bottom row',          keys: 'asdfghjkl;qwertyuiopzxcvbnm,.', newKeys: 'zxcvbnm,.', blurb: 'Reach down; the comma and period join the alphabet.' },
    { id: 'numbers',  title: 'Number row',          keys: '1234567890',               newKeys: '1234567890', blurb: 'The row that costs the most time when it is looked at.' },
    { id: 'symbols',  title: 'Shifted symbols',     keys: '!@#$%^&*()',               newKeys: '!@#$%^&*()', blurb: 'Shift with the opposite hand from the key you are reaching for.' },
    { id: 'punct',    title: 'Punctuation',         keys: "-_=+[]{};:'\",.<>/?\\|`~", newKeys: "-_=+[]{};:'\",.<>/?\\|`~", blurb: 'Brackets, quotes and slashes: the keys code is made of.' },
    { id: 'brackets', title: 'Brackets and operators', keys: null, newKeys: '()[]{}', blurb: 'Whole fragments, not single keys: pairs, comparisons and call syntax.',
      tokens: ['()', '[]', '{}', '(x)', '[i]', '{k: v}', 'a == b', 'a != b', 'x <= 10', 'n >= 0', 'i += 1', 'x -= 2', 'f(a, b)', 'arr[0]', 'obj.key',
               'if (ok) {', '} else {', 'for i in x:', 'while (n--)', 'a && b', 'a || b', '!done', 'x ? y : z', '"text"', "'text'", '`${v}`',
               'a = [1, 2]', 'd = {}', '$HOME', '$(pwd)', './run.sh', '#!/bin', 'a | b', 'a > out', '2>&1', '/* c */', '// c', '# c', '\\n', '=>'] }
  ];

  // ── Randomness (seedable, so tests are repeatable) ─────────────────────────

  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

  // ── Generating text ────────────────────────────────────────────────────────

  /** Real words, no immediate repeats. */
  function randomWords(count, rng) {
    rng = rng || Math.random;
    const out = []; let last = '';
    while (out.length < count) {
      const w = pick(WORDS, rng);
      if (w !== last) { out.push(w); last = w; }
    }
    return out;
  }

  function token(keys, rng, mustHave) {
    const chars = Array.from(keys);
    const len = 2 + Math.floor(rng() * 4);                       // 2..5
    let s = '';
    for (let i = 0; i < len; i++) s += pick(chars, rng);
    if (new Set(s).size === 1 && chars.length > 1) s = s.slice(0, -1) + pick(chars.filter(c => c !== s[0]), rng);
    if (mustHave && !s.includes(mustHave)) {
      const at = Math.floor(rng() * s.length);
      s = s.slice(0, at) + mustHave + s.slice(at + 1);
    }
    return s;
  }

  function lessonById(id) { return LESSONS.find(l => l.id === id) || null; }

  /**
   * Practice text for a lesson. Real words that can be spelt with the lesson's
   * keys are mixed in where there are enough of them; otherwise it is
   * pseudo-words, weighted toward the keys the lesson introduces.
   */
  function lessonDrill(lesson, count, rng) {
    rng = rng || Math.random;
    count = count || 30;
    if (lesson.tokens) {
      const out = []; let last = '';
      while (out.length < count) { const t = pick(lesson.tokens, rng); if (t !== last) { out.push(t); last = t; } }
      return out.join(' ');
    }
    const allowed = new Set(Array.from(lesson.keys));
    const real = WORDS.filter(w => Array.from(w).every(c => allowed.has(c)));
    const fresh = Array.from(lesson.newKeys);
    const out = [];
    for (let i = 0; i < count; i++) {
      const useReal = real.length >= 6 && rng() < 0.5;
      const mustHave = pick(fresh, rng);
      if (useReal) {
        const withNew = real.filter(w => w.includes(mustHave));
        out.push(pick(withNew.length ? withNew : real, rng));
      } else out.push(token(lesson.keys, rng, rng() < 0.7 ? mustHave : null));
    }
    return out.join(' ');
  }

  // ── Scoring ────────────────────────────────────────────────────────────────

  /**
   * A typing session over a fixed target string. Feed it key names ("a",
   * "Backspace", "Tab", "Enter") and timestamps in ms; read stats() at any time.
   *
   * opts.code   Tab types four spaces and Enter types a newline. In prose mode
   *             both are ignored, so a stray Tab never counts as a mistake.
   * opts.limitMs  stop counting at this much time after the first keystroke.
   */
  function createSession(target, opts) {
    opts = opts || {};
    const code = !!opts.code;
    const typed = [], log = [];
    let start = null, end = null, backspaces = 0;

    function press(key, now) {
      if (end !== null) return false;
      if (start !== null && opts.limitMs && now - start >= opts.limitMs) { finish(now); return false; }
      if (key === 'Backspace') {
        if (typed.length) { typed.pop(); backspaces++; }
        return true;
      }
      let chars;
      if (key === 'Tab') { if (!code) return false; chars = '    '; }
      else if (key === 'Enter') { if (!code) return false; chars = '\n'; }
      else if (typeof key === 'string' && key.length === 1) chars = key;
      else return false;
      if (start === null) start = now;
      for (const ch of chars) {
        if (typed.length >= target.length) break;
        const expected = target[typed.length];
        typed.push(ch);
        log.push({ expected, typed: ch, correct: ch === expected });
      }
      if (typed.length >= target.length) end = now;
      return true;
    }

    function finish(now) {
      if (end === null) {
        end = start === null ? now : (opts.limitMs ? Math.min(now, start + opts.limitMs) : now);
      }
    }

    function stats(now) {
      const stop = end !== null ? end : (now === undefined ? start : now);
      let elapsed = start === null ? 0 : Math.max(0, stop - start);
      if (opts.limitMs && elapsed > opts.limitMs) elapsed = opts.limitMs;
      const minutes = elapsed / 60000;
      let correctOnScreen = 0;
      for (let i = 0; i < typed.length; i++) if (typed[i] === target[i]) correctOnScreen++;
      const right = log.filter(k => k.correct).length;
      const keys = {};
      for (const k of log) {
        const name = keyName(k.expected);
        const e = keys[name] || (keys[name] = { n: 0, err: 0 });
        e.n++; if (!k.correct) e.err++;
      }
      return {
        elapsedMs: elapsed,
        wpm: minutes > 0 ? (correctOnScreen / 5) / minutes : 0,
        raw: minutes > 0 ? (log.length / 5) / minutes : 0,
        accuracy: log.length ? (right / log.length) * 100 : 100,
        keystrokes: log.length, correct: right, errors: log.length - right,
        typedLength: typed.length, targetLength: target.length,
        backspaces, errorsPerKey: keys,
        done: end !== null
      };
    }

    return { press, finish, stats, typed: () => typed.slice(), isDone: () => end !== null, started: () => start !== null };
  }

  /** Letters fold to lower case: a missed capital is a Shift problem, not an "A" problem. */
  function keyName(ch) { return /[A-Z]/.test(ch) ? ch.toLowerCase() : ch; }

  // ── Weak keys ──────────────────────────────────────────────────────────────

  function mergeKeys(table, perKey) {
    for (const [k, v] of Object.entries(perKey)) {
      if (k === '\n') continue;
      const e = table[k] || (table[k] = { n: 0, err: 0 });
      e.n += v.n; e.err += v.err;
    }
    return table;
  }

  /** Worst first by error rate; keys with too few presses or no errors are not "weak", just unmeasured. */
  function weakKeys(table, opts) {
    opts = opts || {};
    const min = opts.min || 8, top = opts.top || 6;
    return Object.entries(table || {})
      .filter(([k, v]) => k.trim() && v.n >= min && v.err > 0)
      .map(([key, v]) => ({ key, n: v.n, err: v.err, rate: v.err / v.n }))
      .sort((a, b) => b.rate - a.rate || b.n - a.n)
      .slice(0, top);
  }

  function weakDrill(table, count, rng) {
    rng = rng || Math.random;
    const weak = weakKeys(table);
    if (!weak.length)
      return { ok: false, error: 'No weak keys yet — keep typing. A key needs at least 8 presses and one mistake to show up here.' };
    const keys = weak.map(w => w.key);
    const filler = 'etaoinsrh';
    const out = [];
    for (let i = 0; i < (count || 30); i++) {
      const k = keys[i % keys.length];
      const words = WORDS.filter(w => w.includes(k));
      if (words.length && rng() < 0.6) out.push(pick(words, rng));
      else out.push(token(k + filler + keys.join(''), rng, k));
    }
    return { ok: true, weak, text: out.join(' ') };
  }

  // ── History (localStorage, never required) ─────────────────────────────────

  const STORE_KEY = 'octopus-tools.typing.v1';
  const emptyStore = () => ({ results: [], keys: {}, lessons: {} });

  function load(storage) {
    try {
      const raw = storage && storage.getItem(STORE_KEY);
      if (!raw) return emptyStore();
      const d = JSON.parse(raw);
      return { results: Array.isArray(d.results) ? d.results : [],
               keys: d.keys && typeof d.keys === 'object' ? d.keys : {},
               lessons: d.lessons && typeof d.lessons === 'object' ? d.lessons : {} };
    } catch (e) { return emptyStore(); }
  }

  /** Returns true if it stuck. Private windows and blocked storage throw; the page works anyway. */
  function save(storage, data) {
    try { storage.setItem(STORE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }

  /** `bucket` names what was typed, e.g. "time-30", "words-25", "code-python", "lesson-top", "weak". */
  function record(data, bucket, st, at) {
    data.results.push({ at: at || Date.now(), bucket, wpm: round1(st.wpm), raw: round1(st.raw),
                        acc: round1(st.accuracy), errors: st.errors, secs: Math.round(st.elapsedMs / 1000) });
    if (data.results.length > 500) data.results.splice(0, data.results.length - 500);
    mergeKeys(data.keys, st.errorsPerKey);
    return data;
  }

  const round1 = n => Math.round(n * 10) / 10;

  /** Running best after each result in a bucket: the personal-best curve. */
  function bestSeries(data, bucket) {
    const rows = data.results.filter(r => !bucket || r.bucket === bucket);
    let best = 0;
    return rows.map((r, i) => { best = Math.max(best, r.wpm); return { i, wpm: r.wpm, best, acc: r.acc, at: r.at }; });
  }

  function bests(data) {
    const out = {};
    for (const r of data.results) if (!out[r.bucket] || r.wpm > out[r.bucket].wpm) out[r.bucket] = r;
    return out;
  }

  const PASS_ACCURACY = 95;
  function lessonPassed(st) { return st.done && st.accuracy >= PASS_ACCURACY; }

  const API = { WORDS, SNIPPETS, LESSONS, lessonById, seeded, randomWords, lessonDrill, createSession, keyName,
                mergeKeys, weakKeys, weakDrill, STORE_KEY, emptyStore, load, save, record, bestSeries, bests,
                PASS_ACCURACY, lessonPassed };
  if (typeof module === 'object' && module.exports) module.exports = API;
  global.Typing = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
