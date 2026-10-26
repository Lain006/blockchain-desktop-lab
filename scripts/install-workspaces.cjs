const { spawnSync } = require('node:child_process');
const path = require('node:path');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('请通过 npm install 或 npm run setup 运行安装');
for (const directory of ['blockchaindemo', 'frontend']) {
  console.log(`安装 ${directory} 的锁定依赖…`);
  const result = spawnSync(process.execPath, [npm, 'ci'], { cwd: path.join(__dirname, '..', directory), stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
