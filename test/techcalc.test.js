'use strict';
/**
 * techcalc.test.js — bitwise, data size, timestamps, chmod.
 *
 * Expected values come from Python (`stat.filemode`, `zoneinfo`) or from
 * arithmetic done by hand and written beside the assertion; not from the code
 * under test. The chmod and timestamp groups also re-run Python live when it is
 * installed.
 */
const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('node:path');
const { spawnSync } = require('node:child_process');

const T = require(path.join('..', 'public', 'scripts', 'techcalc.js'));

// ── Bitwise ──────────────────────────────────────────────────────────────────

test('bitwise AND/OR/XOR/NOT at 8 bits', () => {
  assert.equal(T.bitwise('0xB6', '0b00001111', 8, 'AND').hex, '06');          // 10110110 & 00001111
  assert.equal(T.bitwise('0xB6', '0x0F', 8, 'OR').hex, 'BF');
  assert.equal(T.bitwise('0xB6', '0x0F', 8, 'XOR').hex, 'B9');
  assert.equal(T.bitwise('0xB6', '', 8, 'NOT A').hex, '49');
  assert.equal(T.bitwise('0xB6', '0x0F', 8, 'NAND').hex, 'F9');
  assert.equal(T.bitwise('0xB6', '0x0F', 8, 'NOR').hex, '40');
  assert.equal(T.bitwise('0xB6', '0x0F', 8, 'XNOR').hex, '46');
});

test('the binary view is grouped and padded to the width', () => {
  const r = T.bitwise('5', '3', 8, 'AND');
  assert.equal(r.binary.a, '0000 0101');
  assert.equal(r.binary.result, '0000 0001');
  assert.equal(T.bitwise('1', '1', 16, 'OR').binary.a, '0000 0000 0000 0001');
});

test('negative input is two\'s complement at the chosen width, and results show both readings', () => {
  const r = T.bitwise('-1', '0', 8, 'OR');
  assert.equal(r.hex, 'FF');
  assert.equal(r.unsigned, '255');
  assert.equal(r.signed, '-1');
  assert.equal(T.bitwise('-128', '0', 8, 'OR').unsigned, '128');
  assert.equal(T.bitwise('-129', '0', 8, 'OR').ok, false, '-129 does not fit in 8 bits');
});

test('shifts: logical, arithmetic, and the bits that fall off', () => {
  assert.equal(T.bitwise('0x81', '1', 8, 'A << B').hex, '02');                  // top bit is lost
  assert.equal(T.bitwise('0x81', '1', 8, 'A >> B (logical)').hex, '40');
  assert.equal(T.bitwise('0x81', '1', 8, 'A >> B (arithmetic)').hex, 'C0');     // sign bit copied in
  assert.equal(T.bitwise('0x41', '1', 8, 'A >> B (arithmetic)').hex, '20');
  assert.equal(T.bitwise('1', '8', 8, 'A << B').ok, false, 'shift by the full width is refused');
});

test('64-bit values keep every bit (BigInt)', () => {
  const r = T.bitwise('0xFFFFFFFFFFFFFFFF', '1', 64, 'XOR');
  assert.equal(r.hex, 'FFFFFFFFFFFFFFFE');
  assert.equal(r.unsigned, '18446744073709551614');
  assert.equal(r.signed, '-2');
});

test('bitwise refuses what does not fit or does not parse', () => {
  assert.equal(T.bitwise('256', '0', 8, 'AND').ok, false);
  assert.equal(T.bitwise('0b102', '0', 8, 'AND').ok, false);
  assert.equal(T.bitwise('', '0', 8, 'AND').ok, false);
  assert.equal(T.bitwise('1', '1', 12, 'AND').ok, false);
  assert.equal(T.bitwise('1', '1', 8, 'ROT').ok, false);
});

// ── Data size ────────────────────────────────────────────────────────────────

test('bits versus bytes, SI versus IEC', () => {
  const r = T.dataSize('1', 'GB');
  assert.equal(r.bits, 8e9);
  assert.equal(r.conversions.GiB, 8e9 / (8 * 1024 ** 3));                       // 0.931322...
  assert.ok(Math.abs(r.conversions.GiB - 0.9313225746) < 1e-9);
  assert.equal(T.dataSize('1', 'GiB').conversions.B, 1073741824);
  assert.equal(T.dataSize('1', 'KiB').conversions.B, 1024);
  assert.equal(T.dataSize('1', 'kB').conversions.B, 1000);
});

test('transfer time: 1 GB over 100 Mbps is 80 s; 100 Mbps tops out at 12.5 MB/s', () => {
  const r = T.dataSize('1', 'GB', '100', 'Mbps');
  assert.equal(r.seconds, 80);
  assert.equal(r.duration, '1 min 20 s');
  assert.equal(T.dataSize('12.5', 'MB', '100', 'Mbps').seconds, 1);
  assert.equal(T.dataSize('1', 'GiB', '1', 'Gbps').seconds, 8.589934592);       // 8 * 2^30 bits / 1e9
});

test('duration formatting', () => {
  assert.equal(T.duration(0.25), '250 ms');
  assert.equal(T.duration(3661), '1 h 1 min 1 s');
  assert.equal(T.duration(90061), '1 d 1 h 1 min 1 s');
  assert.equal(T.duration(0), '0 ms');
});

test('data size refuses nonsense', () => {
  assert.equal(T.dataSize('-1', 'GB').ok, false);
  assert.equal(T.dataSize('abc', 'GB').ok, false);
  assert.equal(T.dataSize('1', 'GB', '0', 'Mbps').ok, false);
  assert.equal(T.dataSize('1', 'parsec').ok, false);
});

// ── Timestamps (expected values from Python zoneinfo) ────────────────────────

test('timestamp to local time in America/New_York, across DST', () => {
  let r = T.fromTimestamp('1794166200');
  assert.equal(r.local, '2026-11-08 14:30:00');
  assert.equal(r.abbreviation, 'EST');
  assert.equal(r.offset, '-05:00');
  r = T.fromTimestamp('1773000000');                                              // 2026-03-08 16:00 EDT
  assert.equal(r.local, '2026-03-08 16:00:00');
  assert.equal(r.abbreviation, 'EDT');
  assert.equal(r.offset, '-04:00');
  assert.equal(T.fromTimestamp('0', 'UTC').iso, '1970-01-01T00:00:00.000Z');
  assert.equal(T.fromTimestamp('-86400').local, '1969-12-30 19:00:00');
  assert.equal(T.fromTimestamp('1700000000', 'Asia/Kolkata').local, '2023-11-15 03:43:20');
});

test('milliseconds are told apart from seconds', () => {
  const s = T.fromTimestamp('1794166200'), ms = T.fromTimestamp('1794166200000');
  assert.equal(s.unit, 'seconds');
  assert.equal(ms.unit, 'milliseconds');
  assert.equal(s.local, ms.local);
});

test('date to timestamp, including the two hours DST makes odd', () => {
  assert.equal(T.toTimestamp('2026-11-08 14:30:00').seconds, 1794166200);
  assert.equal(T.toTimestamp('2026-07-04').seconds, 1783137600);                  // midnight EDT
  assert.equal(T.toTimestamp('2026-03-08 03:30:00').seconds, 1772955000);         // just after spring forward
  const gap = T.toTimestamp('2026-03-08 02:30:00');
  assert.equal(gap.ok, false, '02:30 does not exist on spring-forward day');
  assert.match(gap.error, /does not exist/);
  const dup = T.toTimestamp('2026-11-01 01:30:00');                               // happens twice
  assert.equal(dup.ambiguous, true);
  assert.equal(dup.seconds, 1793511000);                                          // the EDT one
  assert.equal(dup.alternate, 1793514600);                                        // the EST one
  assert.equal(T.toTimestamp('2026-02-30').ok, false);
  assert.equal(T.toTimestamp('yesterday').ok, false);
  assert.equal(T.toTimestamp('2026-11-08', 'Mars/Olympus').ok, false);
});

// ── chmod (expected values from Python stat.filemode) ────────────────────────

const MODES = [['755', 'rwxr-xr-x'], ['4755', 'rwsr-xr-x'], ['1777', 'rwxrwxrwt'], ['2750', 'rwxr-s---'],
               ['640', 'rw-r-----'], ['4644', 'rwSr--r--'], ['000', '---------'], ['7777', 'rwsrwsrwt'], ['1666', 'rw-rw-rwT']];

test('chmod octal to symbolic, with setuid, setgid and sticky', () => {
  for (const [o, s] of MODES) assert.equal(T.octalToSymbolic(o).symbolic, s, o);
});

test('chmod symbolic to octal, and the ls -l form with its type character', () => {
  for (const [o, s] of MODES) assert.equal(T.symbolicToOctal(s).octal, o, s);
  assert.equal(T.symbolicToOctal('-rwxr-xr-x').octal, '755');
  assert.equal(T.symbolicToOctal('drwxrwxrwt').octal, '1777');
});

test('chmod refuses bad input', () => {
  for (const bad of ['', '8', '75', '77777', '7a5', '-755']) assert.equal(T.octalToSymbolic(bad).ok, false, bad);
  for (const bad of ['', 'rwx', 'rwxrwxrwxx', 'rwxr-xr-q', 'xwrr-xr-x', 'rwtr-xr-x']) assert.equal(T.symbolicToOctal(bad).ok, false, bad);
});

test('chmod describes who can do what', () => {
  const r = T.octalToSymbolic('640');
  assert.deepEqual(r.who, ['owner: read, write', 'group: read', 'others: nothing']);
  assert.deepEqual(T.octalToSymbolic('1777').extras, ['sticky']);
});

const havePy = spawnSync('python3', ['-c', 'import zoneinfo, stat']).status === 0;
test('chmod and timestamps agree with Python over many values', { skip: !havePy && 'python3 not available' }, () => {
  const py = spawnSync('python3', ['-I', '-c', `
import stat, json
from datetime import datetime
from zoneinfo import ZoneInfo
modes = [stat.filemode(stat.S_IFREG | m)[1:] for m in range(0o10000)]
zi = ZoneInfo('America/New_York')
stamps = list(range(1772000000, 1795000000, 1234567))
print(json.dumps({'modes': modes, 'stamps': [[t, datetime.fromtimestamp(t, zi).strftime('%Y-%m-%d %H:%M:%S'), datetime.fromtimestamp(t, zi).tzname()] for t in stamps]}))`],
    { encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(py.status, 0, py.stderr);
  const d = JSON.parse(py.stdout);
  d.modes.forEach((sym, m) => {
    const oct = m.toString(8).padStart(4, '0').replace(/^0(?=\d{3}$)/, '');
    assert.equal(T.octalToSymbolic(oct).symbolic, sym, `mode ${oct}`);
    assert.equal(T.symbolicToOctal(sym).octal, oct, `symbolic ${sym}`);
  });
  for (const [t, local, abbr] of d.stamps) {
    const r = T.fromTimestamp(String(t));
    assert.deepEqual([r.local, r.abbreviation], [local, abbr], String(t));
    assert.equal(T.toTimestamp(local).seconds === t || T.toTimestamp(local).alternate === t, true, `round trip ${local}`);
  }
});
