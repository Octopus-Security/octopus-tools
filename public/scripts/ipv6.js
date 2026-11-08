'use strict';
/**
 * ipv6.js — expand, compress and carve IPv6, in BigInt.
 *
 * Pure: no DOM, no I/O. A classic script (global `IPv6` plus module.exports)
 * for the reason at the top of bases.js: a static import would resolve without
 * the ?v= stamp and go stale behind Cloudflare.
 *
 * An address is 128 bits, past what a Number holds exactly, so every value
 * here is a BigInt.
 */
(function (global) {

  const ONES = (1n << 128n) - 1n;
  const fail = error => ({ ok: false, error });

  /** Text -> BigInt. Accepts "::" once, and a dotted IPv4 tail (::ffff:192.0.2.1). */
  function parse(text) {
    let s = String(text == null ? '' : text).trim();
    if (!s) return fail('Enter an IPv6 address.');
    if (s.includes('%')) s = s.slice(0, s.indexOf('%'));          // zone id: scope, not part of the address
    if (!/^[0-9a-fA-F:.]+$/.test(s)) return fail('An IPv6 address uses only hex digits and colons.');
    if (s.split('::').length > 2) return fail('"::" can appear only once — it would be ambiguous how many groups each stands for.');

    let tail = [];
    const lastColon = s.lastIndexOf(':');
    if (s.includes('.')) {
      const v4 = s.slice(lastColon + 1);
      const o = v4.split('.');
      if (o.length !== 4 || !o.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255))
        return fail(`"${v4}" is not a valid IPv4 tail.`);
      const n = o.map(Number);
      tail = [((n[0] << 8) | n[1]).toString(16), ((n[2] << 8) | n[3]).toString(16)];
      s = s.slice(0, lastColon + 1) + tail.join(':');
    }

    let groups;
    if (s.includes('::')) {
      const [l, r] = s.split('::');
      const left  = l ? l.split(':') : [];
      const right = r ? r.split(':') : [];
      const missing = 8 - left.length - right.length;
      if (missing < 1) return fail('Too many groups for "::" to stand for anything — an address has exactly 8.');
      groups = [...left, ...Array(missing).fill('0'), ...right];
    } else {
      groups = s.split(':');
      if (groups.length !== 8) return fail(`An address without "::" has 8 groups; this has ${groups.length}.`);
    }
    let v = 0n;
    for (let i = 0; i < 8; i++) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i]))
        return fail(`Group ${i + 1} is "${groups[i]}" — each group is 1 to 4 hex digits.`);
      v = (v << 16n) | BigInt(parseInt(groups[i], 16));
    }
    return { ok: true, value: v };
  }

  const groupsOf = v => Array.from({ length: 8 }, (_, i) => Number((v >> BigInt(112 - 16 * i)) & 0xFFFFn));

  const expand = v => groupsOf(v).map(g => g.toString(16).padStart(4, '0')).join(':');

  /** RFC 5952: lowercase, drop leading zeros, "::" for the LONGEST run of 2+ zero groups (first wins a tie). */
  function compress(v) {
    const g = groupsOf(v);
    let bestAt = -1, bestLen = 0;
    for (let i = 0; i < 8;) {
      if (g[i] !== 0) { i++; continue; }
      let j = i; while (j < 8 && g[j] === 0) j++;
      if (j - i > bestLen) { bestAt = i; bestLen = j - i; }
      i = j;
    }
    const hex = g.map(x => x.toString(16));
    if (bestLen < 2) return hex.join(':');
    const l = hex.slice(0, bestAt).join(':'), r = hex.slice(bestAt + bestLen).join(':');
    return `${l}::${r}`;
  }

  const KINDS = [
    [0n, 128, 'unspecified (::)'], [1n, 128, 'loopback (::1)'],
    [0xfe80n << 112n, 10, 'link-local (fe80::/10)'], [0xfc00n << 112n, 7, 'unique local, the IPv6 "private" (fc00::/7)'],
    [0xffn << 120n, 8, 'multicast (ff00::/8)'], [0x20010db8n << 96n, 32, 'documentation (2001:db8::/32)'],
    [0xffffn << 32n, 96, 'IPv4-mapped (::ffff:0:0/96)']
  ];
  function kindOf(v) {
    for (const [net, p, name] of KINDS) {
      if ((v >> BigInt(128 - p)) === (net >> BigInt(128 - p))) return name;
    }
    if ((v >> 125n) === 1n) return 'global unicast (2000::/3)';
    return 'other / reserved';
  }

  const maskOf = p => (p === 0 ? 0n : (ONES << BigInt(128 - p)) & ONES);

  /** Network, range and size for "addr/len". */
  function prefix(text) {
    const m = /^\s*([^/\s]+)\s*\/\s*(\d{1,3})\s*$/.exec(String(text == null ? '' : text));
    if (!m) return fail('Write it as 2001:db8::/32.');
    const len = Number(m[2]);
    if (len > 128) return fail(`/${len} is impossible — an IPv6 address is 128 bits.`);
    const a = parse(m[1]); if (!a.ok) return a;
    const mask = maskOf(len);
    const network = a.value & mask, last = network | (ONES ^ mask);
    const total = 1n << BigInt(128 - len);
    const n = (p) => (len <= p ? (1n << BigInt(p - len)) : 0n);
    return { ok: true, len, input: a.value, network, last, total,
             networkText: compress(network), firstText: compress(network), lastText: compress(last),
             expandedNetwork: expand(network), expandedLast: expand(last),
             slash64: len <= 64 ? (1n << BigInt(64 - len)) : 0n,
             slash48: n(48), slash56: n(56),
             // A prefix longer than /64 lives inside one /64; say what share it is.
             insideOne64: len > 64, kind: kindOf(a.value),
             nonAligned: a.value !== network };
  }

  const API = { parse, expand, compress, prefix, kindOf, maskOf, groupsOf };
  if (typeof module === 'object' && module.exports) module.exports = API;
  global.IPv6 = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
