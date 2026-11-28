// Fails the build when test-only pages (tests/**) leak into the production bundle.
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = 'dist';
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'tests') offenders.push(p);
      walk(p);
    } else if (/harness/i.test(name)) {
      offenders.push(p);
    } else if (p.endsWith('.html') && readFileSync(p, 'utf8').includes('tests/integration/harness')) {
      offenders.push(p);
    }
  }
}

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/index.html missing');
  process.exit(1);
}
walk(root);
if (offenders.length > 0) {
  console.error('test-only files found in dist:', offenders.join(', '));
  process.exit(1);
}
console.log('dist check ok');
