const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { ExperimentManager } = require('../manager.cjs');
const observationServer = require('../observation-server.cjs');

async function until(check) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('等待真实节点状态超时');
}
async function blocks(node) { return (await fetch(`http://127.0.0.1:${node.info.apiPort}/blocks`)).json(); }

test('真实三进程转发、断连重连、保存恢复、端口冲突和退出隔离', { timeout: 45000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blockchain-manager-test-'));
  let manager = new ExperimentManager({ dataDir: dir });
  const blockers = [];
  let server;
  t.after(async () => {
    await manager.close();
    if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await Promise.all(blockers.map((item) => new Promise((resolve) => item.close(resolve))));
    if (dir.startsWith(os.tmpdir())) fs.rmSync(dir, { recursive: true, force: true });
  });
  await manager.initialize();
  assert.equal(manager.error, null);
  let [a, b] = manager.snapshot().nodes;
  assert.equal(a.info.blockCount, 1);
  await manager.action('mine', { id: a.id, data: 'A的区块' });
  await until(() => manager.live.get(b.id).info.blockCount === 2);
  await manager.action('add', { target: a.id });
  const c = manager.snapshot().nodes[2];
  await until(() => manager.live.get(c.id).info.blockCount === 2);
  await manager.action('mine', { id: c.id, data: 'C经A转发到B' });
  await until(() => manager.live.get(b.id).info.blockCount === 3);
  assert.deepEqual(await blocks(manager.snapshot().nodes[0]), await blocks(manager.snapshot().nodes[2]));
  await manager.action('disconnect', { id: a.id, target: b.id });
  await manager.action('mine', { id: b.id, data: '独立节点上的区块' });
  assert.equal((await blocks(manager.snapshot().nodes[0])).length, 3);
  await manager.action('connect', { id: a.id, target: b.id });
  await until(() => manager.live.get(c.id).info.blockCount === 4);
  server = await observationServer(manager, path.join(__dirname, '../../frontend/dist'));
  const url = manager.observationUrl;
  await manager.action('stop', { id: a.id });
  assert.equal((await (await fetch(`${url}/nodes`)).json()).length, 2);
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}/nodes`, { method: 'POST' })).status, 404);
  await manager.action('start', { id: a.id });
  await until(() => manager.live.get(a.id).info.blockCount === 4);
  const saved = manager.snapshot().nodes;
  await manager.close();
  for (const node of saved) for (const port of [node.info.p2pPort, node.info.apiPort]) {
    const blocker = net.createServer();
    blocker.listen(port, '127.0.0.1');
    await once(blocker, 'listening');
    blockers.push(blocker);
  }
  manager = new ExperimentManager({ dataDir: dir });
  await manager.initialize();
  assert.equal(manager.snapshot().nodes.length, 3);
  for (let i = 0; i < 3; i++) {
    const node = manager.snapshot().nodes[i];
    assert.equal(node.id, saved[i].id);
    assert.equal(node.info.blockCount, 4);
    assert.notEqual(node.info.apiPort, saved[i].info.apiPort);
    assert.deepEqual(await blocks(node), await blocks(manager.snapshot().nodes[0]));
  }
  assert.ok(manager.events.some((event) => event.text.includes('原端口')));
  const brokenId = manager.snapshot().nodes[2].id;
  manager.live.get(brokenId).child.kill();
  await until(() => manager.live.get(brokenId).status === 'error');
  assert.equal(manager.snapshot().nodes[0].status, 'running');
  await manager.action('start', { id: brokenId });
  assert.equal(manager.live.get(brokenId).info.blockCount, 4);
  const ports = manager.snapshot().nodes.flatMap((node) => [node.info.p2pPort, node.info.apiPort]);
  await manager.close();
  for (const port of ports) {
    const probe = net.createServer();
    probe.listen(port, '127.0.0.1');
    await once(probe, 'listening');
    await new Promise((resolve) => probe.close(resolve));
  }
  assert.ok(blockers.every((item) => item.listening), '外部进程的占用端口没有被结束');
});
