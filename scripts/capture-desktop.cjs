const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, [path.join(root, 'desktop/tests/acceptance.cjs')], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
for (const [from, to] of [['dev-desktop-wide.png','01-desktop.png'], ['dev-desktop-compact.png','02-compact.png'], ['dev-observation.png','03-observation.png']]) {
  fs.copyFileSync(path.join(root, 'desktop/validation', from), path.join(root, 'docs/screenshots', to));
}
