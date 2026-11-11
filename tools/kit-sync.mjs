/**
 * kit-sync.mjs — vendor octopus-kit's themed dialog into this static site.
 *
 * Why vendored rather than fetched in the Dockerfile: this site has no node
 * runtime and no build step, and tools/stamp-assets.mjs hashes files that are
 * IN the repo. A file the Dockerfile downloads would be unstamped (so a kit bump
 * hides behind Cloudflare's 4h cache), would need network at build time, and
 * would make a kit bump invisible in review. Vendored files are stamped like any
 * other asset and a bump shows up as a diff. The cost is drift, which this script
 * closes: every vendored file carries a header naming the kit tag and a sha256 of
 * the upstream bytes, and `--check` fails if either the file or the pinned tag is
 * out of step (`--remote` also re-downloads the tag and compares).
 *
 *   node tools/kit-sync.mjs                 # download KIT_TAG from GitHub, rewrite the files
 *   node tools/kit-sync.mjs --from <kitdir> # copy from a local kit checkout instead
 *   node tools/kit-sync.mjs --check         # offline: header hash matches the file, tag matches
 *   node tools/kit-sync.mjs --check --remote
 */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const KIT_TAG = 'v0.6.0';
const FILES = [
  { src: 'ui/dialog.js',  dest: 'public/scripts/kit-dialog.js' },
  { src: 'ui/dialog.css', dest: 'public/styles/kit-dialog.css' },
];
const sha = b => createHash('sha256').update(b).digest('hex');
const headerFor = (f, body) =>
  `/* vendored from octopus-kit ${KIT_TAG} ${f.src} | sha256:${sha(body)} | DO NOT EDIT: node tools/kit-sync.mjs */\n`;
const HEADER_RE = /^\/\* vendored from octopus-kit (\S+) (\S+) \| sha256:([0-9a-f]{64}) \| DO NOT EDIT[^\n]*\*\/\n/;

function upstream(args) {
  const i = args.indexOf('--from');
  if (i >= 0) { const d = resolve(args[i + 1]); return f => readFileSync(join(d, f.src)); }
  const dir = mkdtempSync(join(tmpdir(), 'kit-'));
  const tgz = join(dir, 'kit.tgz');
  execFileSync('curl', ['-fsSL', '-o', tgz, `https://codeload.github.com/Octopus-Security/octopus-kit/tar.gz/refs/tags/${KIT_TAG}`]);
  return f => execFileSync('tar', ['-xzOf', tgz, '--wildcards', `*/${f.src}`], { maxBuffer: 1 << 24 });
}

export function problems({ remote = false, args = [] } = {}) {
  const out = [];
  const read = remote ? upstream(args) : null;
  for (const f of FILES) {
    const p = join(ROOT, f.dest);
    if (!existsSync(p)) { out.push(`${f.dest}: missing (run node tools/kit-sync.mjs)`); continue; }
    const text = readFileSync(p, 'utf8');
    const m = text.match(HEADER_RE);
    if (!m) { out.push(`${f.dest}: no vendor header`); continue; }
    const body = Buffer.from(text.slice(m[0].length));
    if (m[1] !== KIT_TAG) out.push(`${f.dest}: vendored from ${m[1]} but KIT_TAG is ${KIT_TAG}`);
    if (sha(body) !== m[3]) out.push(`${f.dest}: edited after vendoring (hash differs from its header)`);
    if (read && sha(read(f)) !== m[3]) out.push(`${f.dest}: differs from ${f.src} at kit ${KIT_TAG}`);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const bad = problems({ remote: args.includes('--remote'), args });
    if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
    console.log(`Vendored kit files match ${KIT_TAG}.`);
  } else {
    const read = upstream(args);
    for (const f of FILES) {
      const body = read(f);
      writeFileSync(join(ROOT, f.dest), headerFor(f, body) + body.toString('utf8'));
      console.log(`wrote ${f.dest}`);
    }
  }
}
