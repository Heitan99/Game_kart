#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const DIRS = ['client/src', 'server/src', 'shared', 'scripts', 'tests'];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (e) {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      walk(full, out);
    } else if (extname(name) === '.js') {
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const d of DIRS) walk(join(ROOT, d), files);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    process.stdout.write('ok   ' + relative(ROOT, file) + '\n');
  } catch (err) {
    failed++;
    process.stdout.write('FAIL ' + relative(ROOT, file) + '\n');
    process.stdout.write(String(err.stderr || err.message) + '\n');
  }
}

process.stdout.write('\n' + files.length + ' archivos comprobados, ' + failed + ' con errores.\n');
if (failed > 0) process.exit(1);
