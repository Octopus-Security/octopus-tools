'use strict';
/**
 * netcalc.test.js — splitting, VLSM, route summarisation and IPv6.
 *
 * Expected values below were NOT taken from the code under test. They were
 * computed independently with Python's `ipaddress` module, and a second group
 * of tests re-runs that module live when python3 is on the PATH (skipped, and
 * said so, when it is not).
 */
const { test } = require('node:test');
const assert   = require('node:assert');
const path     = require('node:path');
const { spawnSync } = require('node:child_process');

const IPv4 = require(path.join('..', 'public', 'scripts', 'ipv4.js'));
const IPv6 = require(path.join('..', 'public', 'scripts', 'ipv6.js'));

// ── Summarisation ────────────────────────────────────────────────────────────

test('four adjacent /24s summarise exactly to a /22', () => {
  const r = IPv4.summarize(['192.168.0.0/24', '192.168.1.0/24', '192.168.2.0/24', '192.168.3.0/24']);
  assert.equal(r.summary, '192.168.0.0/22');
  assert.equal(r.exact, true);
  assert.equal(r.extra, 0);
  assert.deepEqual(r.minimal, ['192.168.0.0/22']);
});

test('a gap makes the summary inexact and reports how much extra it covers', () => {
  const r = IPv4.summarize(['10.0.0.0/24', '10.0.2.0/24']);
  assert.equal(r.summary, '10.0.0.0/22');
  assert.equal(r.exact, false);
  assert.equal(r.extra, 512);
  assert.deepEqual(r.minimal, ['10.0.0.0/24', '10.0.2.0/24']);
});

test('unsorted, overlapping and duplicate input is merged', () => {
  const r = IPv4.summarize(['172.16.5.0/24', '172.16.4.0/22', '172.16.4.0/24', '172.16.0.0/22', '172.16.4.77/24']);
  assert.equal(r.summary, '172.16.0.0/21');
  assert.equal(r.exact, true);
  assert.deepEqual(r.minimal, ['172.16.0.0/21']);
  assert.ok(r.redundant.length >= 2, 'covered entries are not reported');
  assert.ok(r.notes.some(n => /172\.16\.4\.77\/24/.test(n)), 'the non-aligned entry is not mentioned');
});

test('a bare address is a /32, and one network summarises to itself', () => {
  assert.equal(IPv4.summarize(['10.1.2.3']).summary, '10.1.2.3/32');
  assert.equal(IPv4.summarize('10.1.2.0/24').summary, '10.1.2.0/24');
});

test('the two halves of the address space summarise to /0', () => {
  const r = IPv4.summarize(['0.0.0.0/1', '128.0.0.0/1']);
  assert.equal(r.summary, '0.0.0.0/0');
  assert.equal(r.exact, true);
  assert.equal(r.total, 4294967296);
});

test('a range that crosses a high bit pays for it: 10.255/16 + 11.0/16 needs a /7', () => {
  const r = IPv4.summarize(['10.255.0.0/16', '11.0.0.0/16']);
  assert.equal(r.summary, '10.0.0.0/7');
  assert.equal(r.exact, false);
  assert.equal(r.extra, 33423360);
});

test('adjacent but unaligned networks do not merge into a bigger CIDR block', () => {
  // .64/26 + .128/26 are adjacent, yet 64..191 is not a CIDR block.
  const r = IPv4.summarize(['192.168.1.130/26', '192.168.1.64/26']);
  assert.deepEqual(r.minimal, ['192.168.1.64/26', '192.168.1.128/26']);
  assert.equal(r.summary, '192.168.1.0/24');
  assert.equal(r.extra, 128);
});

test('summarize refuses bad lines and names the line', () => {
  const r = IPv4.summarize(['10.0.0.0/24', '10.0.0.0/33']);
  assert.equal(r.ok, false);
  assert.match(r.error, /10\.0\.0\.0\/33/);
  assert.equal(IPv4.summarize('').ok, false);
  assert.equal(IPv4.summarize('300.1.1.1/24').ok, false);
});

// ── Split and VLSM ───────────────────────────────────────────────────────────

test('splitting into a non-power-of-two rounds up and says how many are spare', () => {
  const r = IPv4.splitInto('10.0.0.0/16', 6);
  assert.equal(r.newPrefix, 19);
  assert.equal(r.count, 8);
  assert.equal(r.spare, 2);
  assert.equal(r.subnets[1].cidr, '10.0.32.0/19');
  assert.equal(r.subnets[7].broadcast, '10.0.255.255');
});

test('splitting a non-aligned input starts from its network', () => {
  const r = IPv4.splitInto('192.168.1.130/24', 4);
  assert.deepEqual(r.subnets.map(s => s.cidr),
    ['192.168.1.0/26', '192.168.1.64/26', '192.168.1.128/26', '192.168.1.192/26']);
});

test('splitting into 1 returns the block itself; too many for the host bits is refused', () => {
  assert.equal(IPv4.splitInto('10.0.0.0/30', 1).subnets[0].cidr, '10.0.0.0/30');
  const r = IPv4.splitInto('10.0.0.0/30', 8);
  assert.equal(r.ok, false);
  assert.match(r.error, /3 borrowed bits/);
  assert.equal(IPv4.splitInto('10.0.0.0/24', 0).ok, false);
});

test('splitting a /32 or /31 behaves at the limit', () => {
  assert.equal(IPv4.splitInto('10.0.0.1/32', 2).ok, false);
  const r = IPv4.splitInto('10.0.0.0/31', 2);
  assert.deepEqual(r.subnets.map(s => s.cidr), ['10.0.0.0/32', '10.0.0.1/32']);
});

test('VLSM places largest first, aligned to each block', () => {
  const r = IPv4.vlsm('192.168.10.0/24', [
    { name: 'Link-A', hosts: 2 }, { name: 'Sales', hosts: 100 }, { name: 'Guests', hosts: 25 },
    { name: 'Engineering', hosts: 50 }, { name: 'Link-B', hosts: 2 }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.allocations.map(a => [a.name, a.cidr]), [
    ['Sales', '192.168.10.0/25'], ['Engineering', '192.168.10.128/26'], ['Guests', '192.168.10.192/27'],
    ['Link-A', '192.168.10.224/30'], ['Link-B', '192.168.10.228/30']]);
  assert.equal(r.allocations[0].usable, 126);
  assert.equal(r.allocations[0].spare, 26);
  assert.equal(r.nextFree, '192.168.10.232');
  assert.equal(r.free, 24);
});

test('VLSM refuses when the space runs out and says which request failed', () => {
  const r = IPv4.vlsm('192.168.10.0/24', [100, 100, 100]);
  assert.equal(r.ok, false);
  assert.match(r.error, /Subnet \d/);
  assert.match(r.error, /\/25/);
});

test('VLSM fills a block exactly with no free space left', () => {
  const r = IPv4.vlsm('10.0.0.0/24', [126, 126]);
  assert.equal(r.ok, true);
  assert.equal(r.free, 0);
  assert.equal(r.nextFree, null);
});

test('VLSM rejects empty and non-numeric requests', () => {
  assert.equal(IPv4.vlsm('10.0.0.0/24', []).ok, false);
  assert.equal(IPv4.vlsm('10.0.0.0/24', [0]).ok, false);
  assert.equal(IPv4.vlsm('10.0.0.0/24', ['x']).ok, false);
});

// ── IPv6 ─────────────────────────────────────────────────────────────────────

const exp = a => IPv6.expand(IPv6.parse(a).value);
const cmp = a => IPv6.compress(IPv6.parse(a).value);

test('expand and compress match known forms (verified with Python ipaddress)', () => {
  assert.equal(exp('2001:db8:0:0:1:0:0:1'), '2001:0db8:0000:0000:0001:0000:0000:0001');
  assert.equal(cmp('2001:db8:0:0:1:0:0:1'), '2001:db8::1:0:0:1');      // first of two equal runs wins
  assert.equal(cmp('1:0:0:2:0:0:0:3'), '1:0:0:2::3');                  // the longer run wins
  assert.equal(cmp('0:0:0:0:0:0:0:0'), '::');
  assert.equal(cmp('0:0:0:0:0:0:0:1'), '::1');
  assert.equal(cmp('2001:db8:0:1:1:1:1:1'), '2001:db8:0:1:1:1:1:1');   // a single zero group is not collapsed
  assert.equal(cmp('2001:0DB8:0000:0000:0000:FF00:0042:8329'), '2001:db8::ff00:42:8329');
});

test('"::" in every position, and an IPv4 tail', () => {
  assert.equal(exp('::1'), '0000:0000:0000:0000:0000:0000:0000:0001');
  assert.equal(exp('fe80::'), 'fe80:0000:0000:0000:0000:0000:0000:0000');
  assert.equal(exp('1::2'), '0001:0000:0000:0000:0000:0000:0000:0002');
  assert.equal(exp('::ffff:192.0.2.1'), '0000:0000:0000:0000:0000:ffff:c000:0201');
  assert.equal(cmp('fe80::1%eth0'), 'fe80::1');
});

test('bad IPv6 is refused with a reason', () => {
  for (const bad of ['', '1::2::3', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', 'g::1', '12345::1', '1:2:3:4:5:6:7::8', '::1.2.3', ':::'])
    assert.equal(IPv6.parse(bad).ok, false, `accepted "${bad}"`);
  assert.match(IPv6.parse('1::2::3').error, /only once/);
});

test('prefix range and /64 count (Python ipaddress)', () => {
  let r = IPv6.prefix('2001:db8:abcd::/48');
  assert.equal(r.networkText, '2001:db8:abcd::');
  assert.equal(r.lastText, '2001:db8:abcd:ffff:ffff:ffff:ffff:ffff');
  assert.equal(r.total, 1208925819614629174706176n);
  assert.equal(r.slash64, 65536n);

  r = IPv6.prefix('2001:db8::1/32');                                   // non-aligned input
  assert.equal(r.networkText, '2001:db8::');
  assert.equal(r.nonAligned, true);
  assert.equal(r.slash64, 4294967296n);
  assert.equal(r.slash48, 65536n);
  assert.equal(r.slash56, 16777216n);

  r = IPv6.prefix('::/0');
  assert.equal(r.total, 340282366920938463463374607431768211456n);
  assert.equal(r.slash64, 18446744073709551616n);
  assert.equal(r.lastText, 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff');

  r = IPv6.prefix('2001:db8:1:2::/64');
  assert.equal(r.slash64, 1n);

  r = IPv6.prefix('2001:db8::5/128');
  assert.equal(r.total, 1n);
  assert.equal(r.slash64, 0n);
  assert.equal(r.insideOne64, true);

  r = IPv6.prefix('2001:db8::/70');
  assert.equal(r.lastText, '2001:db8::3ff:ffff:ffff:ffff');
  assert.equal(r.total, 288230376151711744n);
});

test('prefix refuses /129 and missing prefix', () => {
  assert.equal(IPv6.prefix('::/129').ok, false);
  assert.equal(IPv6.prefix('2001:db8::').ok, false);
});

test('address kinds', () => {
  assert.match(IPv6.kindOf(IPv6.parse('fe80::1').value), /link-local/);
  assert.match(IPv6.kindOf(IPv6.parse('fd12:3456::1').value), /unique local/);
  assert.match(IPv6.kindOf(IPv6.parse('ff02::1').value), /multicast/);
  assert.match(IPv6.kindOf(IPv6.parse('2001:db8::1').value), /documentation/);
  assert.match(IPv6.kindOf(IPv6.parse('2606:4700::1').value), /global unicast/);
  assert.match(IPv6.kindOf(IPv6.parse('::1').value), /loopback/);
});

// ── Live cross-check against Python ──────────────────────────────────────────

const py = spawnSync('python3', ['-c', 'import ipaddress'], { encoding: 'utf8' });
const havePy = py.status === 0;

function python(code) {
  const r = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('summarize agrees with Python ipaddress on random inputs', { skip: !havePy && 'python3 not available' }, () => {
  let seed = 12345;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const cases = [];
  for (let c = 0; c < 40; c++) {
    const base = `10.${rnd(4)}.${rnd(8) * 32}`;
    const list = [];
    for (let i = 0, n = 1 + rnd(5); i < n; i++) list.push(`${base}.${rnd(256)}/${24 + rnd(9)}`);
    cases.push(list);
  }
  const expected = python(`
import ipaddress, json
out = []
for case in json.loads(${JSON.stringify(JSON.stringify(cases))}):
    ns = [ipaddress.ip_network(x, strict=False) for x in case]
    minimal = list(ipaddress.collapse_addresses(ns))
    lo = min(n.network_address for n in minimal); hi = max(n.broadcast_address for n in minimal)
    for p in range(32, -1, -1):
        s = ipaddress.ip_network((int(lo), p), strict=False)
        if s.broadcast_address >= hi: break
    out.append([str(s), [str(n) for n in minimal], s.num_addresses - sum(n.num_addresses for n in minimal)])
print(json.dumps(out))`);
  cases.forEach((list, i) => {
    const r = IPv4.summarize(list);
    assert.deepEqual([r.summary, r.minimal, r.extra], expected[i], `case ${JSON.stringify(list)}`);
  });
});

test('splitInto and subnet agree with Python ipaddress', { skip: !havePy && 'python3 not available' }, () => {
  const inputs = [['10.0.0.0/8', 5], ['172.16.9.9/12', 16], ['192.168.1.200/24', 3], ['0.0.0.0/0', 4], ['10.0.0.0/30', 2], ['1.2.3.4/31', 2]];
  const expected = python(`
import ipaddress, json
out = []
for net, n in ${JSON.stringify(inputs)}:
    base = ipaddress.ip_network(net, strict=False)
    bits = 0
    while 2 ** bits < n: bits += 1
    out.append([str(s) for s in base.subnets(prefixlen_diff=bits)][:8])
print(json.dumps(out))`);
  inputs.forEach(([net, n], i) => {
    const r = IPv4.splitInto(net, n);
    assert.deepEqual(r.subnets.slice(0, 8).map(s => s.cidr), expected[i], `${net} / ${n}`);
  });
});

test('IPv6 expand/compress/prefix agree with Python ipaddress', { skip: !havePy && 'python3 not available' }, () => {
  const addrs = ['2001:db8::1', '::', '1:0:0:0:2:0:0:3', 'fe80:0:0:1::5', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', '0:1:0:1:0:1:0:1', '::ffff:10.0.0.1'];
  const nets = ['2001:db8:ff::/40', '::/0', 'fe80::1/10', '2001:db8::7/127', 'ff00::/8'];
  const e = python(`
import ipaddress, json
print(json.dumps([[ipaddress.IPv6Address(a).exploded if '.' not in a else '', ipaddress.IPv6Address(a).compressed] for a in ${JSON.stringify(addrs)}] +
  [[str(n.network_address.compressed), str(n[-1].compressed), str(n.num_addresses)] for n in (ipaddress.ip_network(x, strict=False) for x in ${JSON.stringify(nets)})]))`);
  addrs.forEach((a, i) => {
    if (!a.includes('.')) assert.equal(exp(a), e[i][0], a);
    assert.equal(cmp(a), a.includes('.') ? '::ffff:a00:1' : e[i][1], a);
  });
  nets.forEach((n, i) => {
    const r = IPv6.prefix(n), want = e[addrs.length + i];
    assert.deepEqual([r.networkText, r.lastText, r.total.toString()], want, n);
  });
});

test('subnet() edge cases agree with Python: /0, /31, /32, and a non-aligned address', { skip: !havePy && 'python3 not available' }, () => {
  const inputs = ['0.0.0.0/0', '10.1.2.3/31', '10.1.2.2/31', '203.0.113.9/32', '192.168.1.130/26', '172.31.255.255/12', '255.255.255.255/32', '8.8.8.8/1'];
  const expected = python(`
import ipaddress, json
out = []
for x in ${JSON.stringify(inputs)}:
    n = ipaddress.ip_network(x, strict=False)
    if n.prefixlen == 32: first = last = n.network_address; usable = 1
    elif n.prefixlen == 31: first, last = n[0], n[1]; usable = 2
    else: first, last = n[1], n[-2]; usable = n.num_addresses - 2
    out.append([str(n.network_address), str(first), str(last), usable, str(n.netmask), str(n.hostmask),
                None if n.prefixlen >= 31 else str(n.broadcast_address)])
print(json.dumps(out))`);
  inputs.forEach((x, i) => {
    const r = IPv4.subnet(x);
    assert.deepEqual([r.network, r.firstHost, r.lastHost, r.usable, r.mask, r.wildcard, r.broadcast], expected[i], x);
  });
});
