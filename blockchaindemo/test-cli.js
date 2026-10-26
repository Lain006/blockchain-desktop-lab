const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const { once } = require("node:events");
const Blockchain = require("./Blockchain");

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function until(check, description) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`等待超时：${description}`);
}

function startNode() {
  const child = spawn(process.execPath, ["index.js"], { cwd: __dirname, stdio: "pipe" });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (data) => { output += data; });
  child.stderr.setEncoding("utf8").on("data", (data) => { output += data; });
  return {
    child,
    output: () => output,
    send: (command) => child.stdin.write(`${command}\n`),
  };
}

test("命令行双进程同步、挖矿广播、HTTP 路由及错误恢复", { timeout: 30000 }, async (t) => {
  const ports = new Set();
  while (ports.size < 4) ports.add(await freePort());
  const [p2pA, p2pB, apiA, apiB] = ports;
  const a = startNode();
  const b = startNode();
  const nodes = [a, b];
  t.after(() => nodes.forEach((node) => { if (node.child.exitCode === null) node.child.kill(); }));
  const request = (port, path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
    ...(body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    signal: AbortSignal.timeout(2000),
  });
  const blocks = async (port) => (await request(port, "/blocks")).json();
  try {
    await until(() => nodes.every((node) => node.output().includes("欢迎来到blockchain")), "两个独立入口启动");
    a.send(`open ${p2pA}\napi ${apiA}`);
    await until(() => a.output().includes(`HTTP API 已启动：http://127.0.0.1:${apiA}`), "第一节点启动");
    // 先触发端口占用，再在同一进程重试，确认失败不会锁死服务状态。
    b.send(`open ${p2pA}\nopen ${p2pB}\napi ${apiA}\napi ${apiB}`);
    await until(() => a.output().includes(`HTTP API 已启动：http://127.0.0.1:${apiA}`)
      && b.output().includes(`HTTP API 已启动：http://127.0.0.1:${apiB}`), "服务启动");
    assert.match(b.output(), /EADDRINUSE/);
    const unavailablePort = await freePort();
    assert.equal((await request(apiB, "/addPeer", { peer: `localhost:${unavailablePort}` })).status, 400);
    assert.equal((await blocks(apiA)).length, 1);
    a.send('blockchain\nmine "1111"\nblockchain');
    await until(async () => (await blocks(apiA)).length === 2, "第一个命令行挖矿");
    assert.equal((await blocks(apiA))[1].data, "1111");
    assert.match(a.output(), /Genesis Block/);
    b.send(`connect localhost ${p2pA}`);
    await until(async () => (await blocks(apiB)).length === 2, "连接后同步已有区块");
    assert.deepEqual(await blocks(apiB), await blocks(apiA));
    b.send('mine “asdsad”\nblockchain');
    await until(async () => (await blocks(apiA)).length === 3, "第二节点挖矿广播");
    assert.deepEqual(await blocks(apiA), await blocks(apiB));
    assert.equal((await blocks(apiA))[2].data, "asdsad");
    assert.ok(new Blockchain().isValidChain(await blocks(apiA)));
    console.log("双进程命令行挖矿与同步通过");
    const info = await (await request(apiB, "/nodeInfo")).json();
    assert.deepEqual(info, { p2pPort: p2pB, apiPort: apiB, blockCount: 3 });
    const directory = async () => (await request(apiA, "/nodes")).json();
    const ownApi = `http://127.0.0.1:${apiA}`;
    const otherApi = `http://127.0.0.1:${apiB}`;
    assert.deepEqual(await directory(), [ownApi]);
    const peersBeforeDirectory = await (await request(apiA, "/peers")).json();
    a.send(`observe ${otherApi}/\nobserve ${otherApi}\nnodes`);
    await until(async () => (await directory()).length === 2, "后端添加目录并去重");
    assert.deepEqual(await directory(), [ownApi, otherApi]);
    a.send(`observe javascript:bad\nobserve http://user:pass@localhost:3002\nunobserve ${ownApi}`);
    await until(() => a.output().includes("不能移除"), "后端拒绝无效地址和移除自身");
    assert.deepEqual(await directory(), [ownApi, otherApi]);
    assert.equal((await request(apiA, "/nodes", { address: otherApi })).status, 404);
    a.send(`unobserve ${otherApi}`);
    await until(async () => (await directory()).length === 1, "后端移除目录");
    assert.deepEqual(await (await request(apiA, "/peers")).json(), peersBeforeDirectory);
    console.log("后端节点目录、去重、输入校验、只读接口及不影响 P2P 验证通过");
    const peers = await (await request(apiA, "/peers")).json();
    assert.ok(peers.some((peer) => peer.endsWith(`:${p2pB}`)));
    const mined = await request(apiA, "/mineBlock", { data: "HTTP 中文区块" });
    assert.equal(mined.status, 200);
    await until(async () => (await blocks(apiB)).length === 4, "HTTP 挖矿广播");
    for (const body of [{}, { data: 1111 }, { data: null }]) {
      assert.equal((await request(apiA, "/mineBlock", body)).status, 400);
    }
    assert.equal((await request(apiA, "/mineBlock")).status, 404);
    assert.equal((await request(apiA, "/addPeer", { peer: "错误格式" })).status, 400);
    assert.equal((await request(apiA, "/addPeer", { peer: `localhost:${p2pB}` })).status, 200);
    assert.equal((await request(apiB, "/addPeer", { host: "localhost", port: p2pA })).status, 200);
    console.log("HTTP 路由与输入校验通过");
    a.send(`open abc\nopen ${p2pA}\napi ${apiB}\nmine "未闭合\nblockhain\npeers`);
    await until(() => a.output().includes("未知命令"), "错误输入不退出");
    assert.match(a.output(), /端口必须/);
    assert.match(a.output(), /服务器已启动/);
    assert.match(a.output(), /数据引号未闭合/);
    assert.equal((await blocks(apiA)).length, 4);
    const exits = nodes.map((node) => once(node.child, "exit"));
    console.log("开始验证双进程退出");
    nodes.forEach((node) => node.send("exit"));
    for (const result of await Promise.all(exits)) assert.equal(result[0], 0);
    // 退出后同一端口可以重新监听，防止 CLI 遗留服务。
    for (const port of ports) {
      const server = net.createServer();
      server.listen(port, "127.0.0.1");
      await once(server, "listening");
      await new Promise((resolve) => server.close(resolve));
    }
  } finally {
    nodes.forEach((node) => { if (node.child.exitCode === null) node.child.kill(); });
  }
});
