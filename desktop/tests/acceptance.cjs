const { _electron: electron, chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'desktop/validation');
fs.mkdirSync(output, { recursive: true });
const data = fs.mkdtempSync(path.join(os.tmpdir(), '区块链 桌面验收-'));
const specified = process.argv.find((value) => value.startsWith('--exe='));
const executablePath = specified ? path.resolve(specified.slice(6)) : require('electron');
const args = [...(specified ? [] : [root]), `--lab-data-dir=${data}`];
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (specified) { env.PATH = process.env.SystemRoot + '\\System32'; env.Path = env.PATH; }
let application;
let browser;
const report = { packaged: Boolean(specified), executablePath, checks: [], screenshots: [] };
async function launch() {
  application = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const page = await application.firstWindow();
  await expect.poll(() => page.evaluate(() => window.lab.action('state').then((value) => value.ready)), { timeout: 30000 }).toBe(true);
  const state = await page.evaluate(() => window.lab.action('state'));
  assert.equal(state.error, null, JSON.stringify(state));
  return page;
}
async function state(page) { return page.evaluate(() => window.lab.action('state')); }
async function blockSnapshot(node) { return (await fetch(`http://127.0.0.1:${node.info.apiPort}/blocks`)).json(); }
async function screenshot(page, name) {
  const file = path.join(output, `${specified ? 'packaged' : 'dev'}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }); report.screenshots.push(file);
}
(async () => {
  try {
    let page = await launch();
    const initial = await state(page);
    assert.equal(initial.nodes.length, 2);
    assert.ok(initial.nodes.every((node) => node.info.blockCount === 1));
    report.checks.push('首次两个独立进程、创世链和真实连接');
    const duplicate = spawn(executablePath, args, { env, windowsHide: true, stdio: 'ignore' });
    const duplicateExit = await Promise.race([once(duplicate, 'exit'), new Promise((_, reject) => setTimeout(() => reject(new Error('第二实例未退出')), 10000))]);
    assert.equal(duplicateExit[0], 0);
    assert.equal((await state(page)).nodes.length, 2);
    report.checks.push('重复打开仅激活已有实例');
    await page.getByLabel('写入新区块的内容').fill('桌面按钮真实挖矿A');
    await page.getByRole('button', { name: '挖矿生成区块', exact: true }).click();
    await expect.poll(async () => (await state(page)).nodes.every((node) => node.info.blockCount === 2)).toBe(true);
    await page.getByRole('button', { name: '＋ 新增节点', exact: true }).click();
    await page.getByRole('button', { name: '创建并启动', exact: true }).click();
    await expect.poll(async () => (await state(page)).nodes.length).toBe(3);
    await expect.poll(async () => (await state(page)).nodes.every((node) => node.info?.blockCount === 2)).toBe(true);
    await page.getByRole('button', { name: '选择节点 C', exact: true }).click();
    await page.getByLabel('写入新区块的内容').fill('C通过A传给B');
    await page.getByRole('button', { name: '挖矿生成区块', exact: true }).click();
    await expect.poll(async () => (await state(page)).nodes.every((node) => node.info?.blockCount === 3)).toBe(true);
    const grown = await state(page);
    const expectedChain = await blockSnapshot(grown.nodes[0]);
    for (const node of grown.nodes) assert.deepEqual(await blockSnapshot(node), expectedChain);
    report.checks.push('按钮新增C、真实长链同步、C经A转发到B、三个节点逐字段一致');
    await screenshot(page, 'desktop-wide');
    await page.getByRole('button', { name: '选择节点 A', exact: true }).click();
    await page.getByRole('button', { name: '停止节点', exact: true }).click();
    await expect.poll(async () => (await state(page)).nodes[0].status).toBe('stopped');
    const observationUrl = (await state(page)).observationUrl;
    assert.equal((await (await fetch(`${observationUrl}/nodes`)).json()).length, 2);
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const observation = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await observation.goto(observationUrl);
    await expect(observation.getByText('后端目录不可用', { exact: false })).toHaveCount(0);
    await expect(observation.locator('.node-tab')).toHaveCount(2);
    await expect(observation.locator('.inspector .detail-index')).toHaveText('#2');
    await expect(observation.locator('.inspector .data-value')).toHaveText('C通过A传给B');
    await screenshot(observation, 'observation');
    report.checks.push('停止A后目录与真实观测网页继续可用');
    await browser.close(); browser = null;
    await page.getByRole('button', { name: '启动节点', exact: true }).click();
    await expect.poll(async () => (await state(page)).nodes[0].status).toBe('running');
    await page.getByRole('button', { name: '选择节点 B', exact: true }).click();
    await page.getByRole('button', { name: '断开连接', exact: true }).click();
    await expect.poll(async () => (await state(page)).links.length).toBe(1);
    await page.getByLabel('写入新区块的内容').fill('B断连时独立生成');
    await page.getByRole('button', { name: '挖矿生成区块', exact: true }).click();
    await expect.poll(async () => (await state(page)).nodes[1].info.blockCount).toBe(4);
    assert.equal((await blockSnapshot((await state(page)).nodes[0])).length, 3);
    await page.getByRole('button', { name: '连接节点', exact: true }).click();
    await expect.poll(async () => (await state(page)).nodes.every((node) => node.info.blockCount === 4)).toBe(true);
    report.checks.push('按钮断连、独立挖矿与重连恢复');
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(940, 720));
    await screenshot(page, 'desktop-compact');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const before = await state(page);
    const ports = before.nodes.flatMap((node) => [node.info.p2pPort, node.info.apiPort]);
    ports.push(new URL(before.observationUrl).port * 1);
    const chain = await blockSnapshot(before.nodes[0]);
    await application.close(); application = null;
    for (const port of ports) {
      const probe = net.createServer(); probe.listen(port, '127.0.0.1'); await once(probe, 'listening');
      await new Promise((resolve) => probe.close(resolve));
    }
    page = await launch();
    await expect.poll(async () => (await state(page)).nodes.every((node) => node.info?.blockCount === 4)).toBe(true);
    const restored = await state(page);
    assert.deepEqual(restored.nodes.map((node) => node.id), before.nodes.map((node) => node.id));
    for (const node of restored.nodes) assert.deepEqual(await blockSnapshot(node), chain);
    report.checks.push('关闭释放全部端口；重开恢复稳定ID、完整链及连接');
    await application.close(); application = null;
    console.log(JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(output, `${specified ? 'packaged' : 'dev'}-acceptance.json`), JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    await application?.close();
    if (data.startsWith(os.tmpdir())) fs.rmSync(data, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
