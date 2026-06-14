#!/usr/bin/env node
// Compatibility guard for the quaat/autonomous-development contract.
//
// Always (CI-safe, no upstream needed): verify that every schema mirrored under
// resources/schemas/ still matches the checksum recorded in
// resources/reference-lock.json. This makes any accidental edit to a mirrored
// schema a hard failure, and forces a deliberate lock update (and a matching
// docs/REFERENCE.md reconciliation) whenever upstream is re-mirrored.
//
// Optionally (when the reference is present): byte-compare each mirrored schema
// against the live upstream checkout and report drift, so a maintainer can tell
// the mirror has fallen behind the controller.
//
// Flags:
//   --update            Rewrite the checksums (and short revision, if a reference
//                       is found) in reference-lock.json from the current files.
//   --reference <dir>   Path to a quaat/autonomous-development checkout to compare
//                       against. Defaults to $CLAUDE_AD_REFERENCE, then the
//                       installed plugin location. Skipped if none exists.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const schemasDir = join(repoRoot, 'resources', 'schemas');
const lockPath = join(repoRoot, 'resources', 'reference-lock.json');

const args = process.argv.slice(2);
const update = args.includes('--update');
const refFlagIndex = args.indexOf('--reference');
const refArg = refFlagIndex >= 0 ? args[refFlagIndex + 1] : undefined;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const recorded = lock.schemas ?? {};

// --- 1. Mirror self-consistency: files on disk vs. recorded checksums ---------
const onDisk = new Map();
for (const name of readdirSync(schemasDir)) {
  if (!name.endsWith('.schema.json')) continue;
  // run-event.schema.json is this project's own protocol schema, not a mirror.
  if (name === 'run-event.schema.json') continue;
  onDisk.set(name, sha256(readFileSync(join(schemasDir, name))));
}

if (update) {
  const updated = {};
  for (const name of [...onDisk.keys()].sort()) updated[name] = onDisk.get(name);
  lock.schemas = updated;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.log(`Updated ${lockPath} with ${onDisk.size} schema checksum(s).`);
  process.exit(0);
}

const problems = [];
for (const [name, hash] of onDisk) {
  if (!(name in recorded)) {
    problems.push(`  + ${name} is present but not recorded in reference-lock.json`);
  } else if (recorded[name] !== hash) {
    problems.push(
      `  ~ ${name} checksum drift:\n      recorded ${recorded[name]}\n      on disk  ${hash}`
    );
  }
}
for (const name of Object.keys(recorded)) {
  if (!onDisk.has(name))
    problems.push(`  - ${name} is recorded but missing from resources/schemas/`);
}

if (problems.length > 0) {
  fail([
    'Mirrored schema set no longer matches resources/reference-lock.json:',
    ...problems,
    '',
    'If you deliberately re-mirrored upstream schemas, run:',
    '  npm run verify:reference -- --update',
    'and reconcile docs/REFERENCE.md in the same change.'
  ]);
}
console.log(
  `Mirror lock OK: ${onDisk.size} schema(s) match resources/reference-lock.json (rev ${lock.shortRevision}).`
);

// --- 2. Optional upstream drift comparison -----------------------------------
const candidates = [
  refArg,
  process.env.CLAUDE_AD_REFERENCE,
  join(process.env.HOME ?? '', '.local/share/claude/plugins/autonomous-development')
].filter(Boolean);

const refRoot = candidates.find((dir) => existsSync(join(dir, 'schemas')));
if (!refRoot) {
  console.log(
    'Upstream reference not found locally; skipping drift comparison (mirror lock already verified).'
  );
  process.exit(0);
}

const refSchemas = join(refRoot, 'schemas');
const drift = [];
for (const name of onDisk.keys()) {
  const refFile = join(refSchemas, name);
  if (!existsSync(refFile)) {
    drift.push(`  - ${name} no longer exists upstream`);
    continue;
  }
  if (sha256(readFileSync(refFile)) !== onDisk.get(name)) {
    drift.push(`  ~ ${name} differs from upstream ${refRoot}`);
  }
}
for (const name of readdirSync(refSchemas)) {
  if (name.endsWith('.schema.json') && !onDisk.has(name)) {
    drift.push(`  + upstream has ${name} which is not mirrored`);
  }
}

if (drift.length > 0) {
  fail([
    `Mirror has drifted from upstream reference at ${refRoot}:`,
    ...drift,
    '',
    'Re-mirror the changed schemas, then run `npm run verify:reference -- --update`',
    'and reconcile docs/REFERENCE.md.'
  ]);
}
console.log(`Upstream OK: mirror matches reference at ${refRoot}.`);
