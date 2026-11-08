'use strict';
/**
 * techcalc.js — the small calculators that don't need a page each:
 * bitwise operations, data size and transfer time, Unix timestamps, chmod.
 *
 * Pure: no DOM, no I/O. A classic script (global `TechCalc` plus module.exports)
 * for the reason at the top of bases.js.
 *
 * Base conversion and two's complement already live in bases.js, and the
 * prefix/mask table in subnet.html; they are deliberately not repeated here.
 */
(function (global) {

  const fail = error => ({ ok: false, error });

  // ── Bitwise ────────────────────────────────────────────────────────────────

  /** 255, 0xFF, 0b1010, 0o17; a leading "-" is read as two's complement at the chosen width. */
  function parseInt_(text, width) {
    const s = String(text == null ? '' : text).trim().replace(/_/g, '');
    if (!s) return fail('Enter a number.');
    const m = /^(-?)(0x[0-9a-f]+|0b[01]+|0o[0-7]+|\d+)$/i.exec(s);
    if (!m) return fail(`"${s}" is not a number — use decimal, 0x… hex, 0b… binary or 0o… octal.`);
    let v = BigInt(m[2].toLowerCase());
    const mod = 1n << BigInt(width);
    if (m[1]) {
      if (v > mod / 2n) return fail(`-${v} does not fit in ${width} bits (the lowest is -${mod / 2n}).`);
      v = (mod - v) % mod;
    }
    if (v >= mod) return fail(`${s} does not fit in ${width} bits (the largest is ${mod - 1n}).`);
    return { ok: true, value: v };
  }

  const OPS = ['AND', 'OR', 'XOR', 'NAND', 'NOR', 'XNOR', 'NOT A', 'A << B', 'A >> B (logical)', 'A >> B (arithmetic)'];

  function bitwise(aText, bText, width, op) {
    if (![8, 16, 32, 64].includes(width)) return fail('Width must be 8, 16, 32 or 64 bits.');
    if (!OPS.includes(op)) return fail(`Unknown operation "${op}".`);
    const a = parseInt_(aText, width); if (!a.ok) return a;
    const mask = (1n << BigInt(width)) - 1n;
    let b = { ok: true, value: 0n };
    if (op !== 'NOT A') { b = parseInt_(bText, width); if (!b.ok) return b; }
    const A = a.value, B = b.value;
    const signed = x => (x >> BigInt(width - 1) ? x - (1n << BigInt(width)) : x);
    let r;
    switch (op) {
      case 'AND': r = A & B; break;
      case 'OR': r = A | B; break;
      case 'XOR': r = A ^ B; break;
      case 'NAND': r = ~(A & B) & mask; break;
      case 'NOR': r = ~(A | B) & mask; break;
      case 'XNOR': r = ~(A ^ B) & mask; break;
      case 'NOT A': r = ~A & mask; break;
      default: {
        if (B >= BigInt(width)) return fail(`Shifting ${width} bits by ${B} leaves nothing; use a shift below ${width}.`);
        const n = BigInt(B);
        if (op === 'A << B') r = (A << n) & mask;
        else if (op === 'A >> B (logical)') r = A >> n;
        else r = BigInt.asUintN(width, signed(A) >> n);
      }
    }
    const bin = x => x.toString(2).padStart(width, '0').replace(/(.{4})(?=.)/g, '$1 ');
    return { ok: true, width, op, a: A, b: B, result: r,
             binary: { a: bin(A), b: bin(B), result: bin(r) },
             hex: r.toString(16).toUpperCase().padStart(width / 4, '0'),
             unsigned: r.toString(), signed: signed(r).toString() };
  }

  // ── Data size and transfer time ────────────────────────────────────────────

  // Everything is held in bits as a Number; a petabyte is 8e15 bits, inside 2^53.
  const SIZE_UNITS = {
    bit: 1, B: 8,
    kB: 8e3, MB: 8e6, GB: 8e9, TB: 8e12,
    KiB: 8 * 1024, MiB: 8 * 1024 ** 2, GiB: 8 * 1024 ** 3, TiB: 8 * 1024 ** 4
  };
  const RATE_UNITS = { bps: 1, kbps: 1e3, Mbps: 1e6, Gbps: 1e9, 'kB/s': 8e3, 'MB/s': 8e6, 'MiB/s': 8 * 1024 ** 2 };

  function duration(sec) {
    if (!isFinite(sec)) return 'never';
    if (sec < 1) return `${+(sec * 1000).toPrecision(3)} ms`;
    let s = Math.round(sec * 1000) / 1000;
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600);  s -= h * 3600;
    const m = Math.floor(s / 60);    s -= m * 60;
    const parts = [];
    if (d) parts.push(`${d} d`);
    if (h) parts.push(`${h} h`);
    if (m) parts.push(`${m} min`);
    if (s || !parts.length) parts.push(`${+s.toFixed(2)} s`);
    return parts.join(' ');
  }

  function dataSize(value, unit, rate, rateUnit) {
    const n = Number(value);
    if (!isFinite(n) || n < 0 || String(value).trim() === '') return fail('Enter a size of 0 or more.');
    if (!(unit in SIZE_UNITS)) return fail(`Unknown unit "${unit}".`);
    const bits = n * SIZE_UNITS[unit];
    const conv = {};
    for (const u of Object.keys(SIZE_UNITS)) conv[u] = bits / SIZE_UNITS[u];
    const out = { ok: true, bits, bytes: bits / 8, conversions: conv };
    if (rate !== undefined && rate !== null && String(rate).trim() !== '') {
      const r = Number(rate);
      if (!isFinite(r) || r <= 0) return fail('The rate must be more than 0.');
      if (!(rateUnit in RATE_UNITS)) return fail(`Unknown rate unit "${rateUnit}".`);
      out.bitsPerSecond = r * RATE_UNITS[rateUnit];
      out.seconds = bits / out.bitsPerSecond;
      out.duration = duration(out.seconds);
    }
    return out;
  }

  // ── Unix timestamps ────────────────────────────────────────────────────────

  const DEFAULT_ZONE = 'America/New_York';

  function zoneOk(zone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch (e) { return false; }
  }

  function parts(ms, zone) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
    const o = {};
    for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
    return o;
  }
  /** Offset of `zone` from UTC at an instant, in minutes. */
  function offsetMin(ms, zone) {
    const p = parts(ms, zone);
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  const fmtOffset = m => `${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`;

  /** Seconds or milliseconds, told apart by size: anything past 1e11 is not a plausible count of seconds. */
  function fromTimestamp(text, zone) {
    zone = zone || DEFAULT_ZONE;
    if (!zoneOk(zone)) return fail(`"${zone}" is not a time zone name — use something like America/New_York or UTC.`);
    const s = String(text == null ? '' : text).trim();
    if (!/^-?\d+(\.\d+)?$/.test(s)) return fail('A timestamp is a number of seconds (or milliseconds) since 1970-01-01 UTC.');
    let n = Number(s);
    const unit = Math.abs(n) >= 1e11 ? 'milliseconds' : 'seconds';
    const ms = unit === 'seconds' ? Math.round(n * 1000) : Math.round(n);
    if (!isFinite(ms) || Math.abs(ms) > 8.64e15) return fail('That is outside the range a date can hold.');
    return describe(ms, zone, unit);
  }

  function describe(ms, zone, unit) {
    const p = parts(ms, zone), off = offsetMin(ms, zone);
    return { ok: true, unit, seconds: Math.floor(ms / 1000), ms, zone,
             local: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`,
             abbreviation: p.timeZoneName, offset: fmtOffset(off),
             iso: new Date(ms).toISOString(),
             localIso: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${fmtOffset(off)}` };
  }

  /**
   * Wall-clock time in a zone -> timestamp. The offset depends on the instant,
   * which depends on the offset, so it is iterated; a time inside a spring-forward
   * gap does not exist and is refused rather than quietly shifted.
   */
  function toTimestamp(text, zone) {
    zone = zone || DEFAULT_ZONE;
    if (!zoneOk(zone)) return fail(`"${zone}" is not a time zone name — use something like America/New_York or UTC.`);
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(text == null ? '' : text).trim());
    if (!m) return fail('Write the date as 2026-11-08 or 2026-11-08 14:30:00.');
    const [Y, Mo, D, h, mi, se] = [m[1], m[2], m[3], m[4] || 0, m[5] || 0, m[6] || 0].map(Number);
    const wall = Date.UTC(Y, Mo - 1, D, h, mi, se);
    const check = new Date(wall);
    if (check.getUTCMonth() !== Mo - 1 || check.getUTCDate() !== D || h > 23 || mi > 59 || se > 59)
      return fail('That date or time does not exist.');
    const matches = new Set();
    for (const guessOff of [offsetMin(wall - 86400000, zone), offsetMin(wall + 86400000, zone)]) {
      const cand = wall - guessOff * 60000;
      if (Math.floor((cand + offsetMin(cand, zone) * 60000 - wall) / 1000) === 0) matches.add(cand);
    }
    if (!matches.size) return fail(`${text.trim()} does not exist in ${zone}: the clocks skip over it when daylight saving starts.`);
    const list = [...matches].sort((a, b) => a - b);
    const ms = list[0];
    const r = describe(ms, zone, 'seconds');
    r.ambiguous = list.length > 1;
    if (r.ambiguous) { r.alternate = Math.floor(list[1] / 1000); }
    return r;
  }

  // ── chmod ──────────────────────────────────────────────────────────────────

  function octalToSymbolic(text) {
    const s = String(text == null ? '' : text).trim();
    if (!/^[0-7]{3,4}$/.test(s)) return fail('Use three or four octal digits (each 0 to 7), like 755 or 4755.');
    const d = s.padStart(4, '0').split('').map(Number);
    const special = d[0];
    const triple = (n, sp, spChar) => {
      const r = n & 4 ? 'r' : '-', w = n & 2 ? 'w' : '-';
      let x = n & 1 ? 'x' : '-';
      if (sp) x = x === 'x' ? spChar : spChar.toUpperCase();
      return r + w + x;
    };
    const sym = triple(d[1], special & 4, 's') + triple(d[2], special & 2, 's') + triple(d[3], special & 1, 't');
    const who = ['owner', 'group', 'others'].map((w, i) => {
      const n = d[i + 1];
      return `${w}: ${[n & 4 ? 'read' : null, n & 2 ? 'write' : null, n & 1 ? 'execute' : null].filter(Boolean).join(', ') || 'nothing'}`;
    });
    const extras = [special & 4 ? 'setuid' : null, special & 2 ? 'setgid' : null, special & 1 ? 'sticky' : null].filter(Boolean);
    return { ok: true, octal: s.padStart(special ? 4 : 3, '0').replace(/^0(?=\d{3}$)/, ''), symbolic: sym, who, extras };
  }

  function symbolicToOctal(text) {
    let s = String(text == null ? '' : text).trim();
    if (s.length === 10 && /^[-dlcbps]/.test(s)) s = s.slice(1);          // ls -l form: drop the file-type char
    if (!/^[-rwxsStT]{9}$/.test(s))
      return fail('Write nine characters like rwxr-xr-x (an ls -l string with its leading type character also works).');
    const digit = (t, i) => {
      const [r, w, x] = t;
      const okR = r === 'r' || r === '-', okW = w === 'w' || w === '-';
      const okX = i < 2 ? 'xsS-'.includes(x) : 'xtT-'.includes(x);
      if (!okR || !okW || !okX) return null;
      return (r === 'r' ? 4 : 0) + (w === 'w' ? 2 : 0) + ('xst'.includes(x) ? 1 : 0);
    };
    const t = [s.slice(0, 3), s.slice(3, 6), s.slice(6, 9)];
    const ds = t.map(digit);
    if (ds.some(x => x === null)) return fail(`"${s}" is not a valid permission string: positions run r w x, and s/S/t/T only replace the x of the owner, group or others.`);
    const special = ('sS'.includes(t[0][2]) ? 4 : 0) + ('sS'.includes(t[1][2]) ? 2 : 0) + ('tT'.includes(t[2][2]) ? 1 : 0);
    return { ok: true, octal: (special ? String(special) : '') + ds.join(''), symbolic: s };
  }

  const API = { parseInt_, OPS, bitwise, SIZE_UNITS, RATE_UNITS, duration, dataSize,
                DEFAULT_ZONE, fromTimestamp, toTimestamp, octalToSymbolic, symbolicToOctal };
  if (typeof module === 'object' && module.exports) module.exports = API;
  global.TechCalc = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
