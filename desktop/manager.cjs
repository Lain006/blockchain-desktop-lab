const { EventEmitter, once } = require('node:events');
const { fork } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const jsonStore = require('../blockchaindemo/json-store');

function validConfig(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.links)) return false;
  if (!value.nodes.every((node) => /^[a-z0-9-]{1,80}$/.test(node.id) && typeof node.name === 'string'
    && node.name.length > 0 && node.name.length <= 40 && typeof node.running === 'boolean'
    && [node.p2pPort, node.apiPort].every((port) => port === null || Number.isInteger(port) && port > 0 && port <= 65535))) return false;
  const ids = new Set(value.nodes.map((node) => node.id));
  return ids.size === value.nodes.length && value.links.every((link) => Array.isArray(link) && link.length === 2
    && link[0] !== link[1] && link.every((id) => ids.has(id)));
}

class ExperimentManager extends EventEmitter {
  constructor({ dataDir, spawnNode = () => fork(path.join(__dirname, 'node-worker.cjs'), [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true }) }) {
    super();
    this.dataDir = dataDir;
    this.spawnNode = spawnNode;
    this.config = { version: 1, nodes: [], links: [] };
    this.live = new Map();
    this.events = [];
    this.sequence = 0;
    this.queue = Promise.resolve();
    this.closing = false;
    this.ready = false;
    this.error = null;
    this.store = jsonStore(path.join(dataDir, 'experiment.json'), validConfig, (text) => this.record(null, text));
  }
  record(id, text, command = '') {
    this.events.unshift({ id: ++this.sequence, nodeId: id, time: Date.now(), text, command });
    this.events = this.events.slice(0, 150);
    this.changed();
  }
  changed() { this.emit('change', this.snapshot()); }
  snapshot() {
    return { ready: this.ready, error: this.error, dataDir: this.dataDir,
      nodes: this.config.nodes.map((node) => {
        const live = this.live.get(node.id);
        return { ...node, status: live?.status || 'stopped', info: live?.info || null, error: live?.error || null, logs: live?.logs || '' };
      }), links: this.config.links, events: this.events, observationUrl: this.observationUrl || null };
  }
  persist(next) { this.store.save(next); this.config = next; this.changed(); }
  async initialize() {
    try {
      const saved = this.store.load();
      if (saved) this.config = saved;
      else this.persist({ version: 1, nodes: ['A', 'B'].map((name) => ({ id: randomUUID(), name, running: true, p2pPort: null, apiPort: null })), links: [] });
      if (!saved) this.persist({ ...this.config, links: [[this.config.nodes[0].id, this.config.nodes[1].id]] });
      for (const node of this.config.nodes) if (node.running) {
        try { await this.start(node.id, false); } catch (error) { this.record(node.id, error.message); }
      }
      await this.restoreLinks();
    } catch (error) { this.error = error.message; this.record(null, error.message); }
    this.ready = true;
    this.changed();
  }
  node(id) {
    const node = this.config.nodes.find((item) => item.id === id);
    if (!node) throw new Error('节点不存在');
    return node;
  }
  async start(id, restore = true) {
    const node = this.node(id);
    if (this.live.get(id)?.child) return;
    const child = this.spawnNode();
    const live = { child, status: 'starting', info: null, error: null, pending: new Map(), requestId: 0, logs: '' };
    this.live.set(id, live);
    this.changed();
    const receive = (message) => {
      if (message.requestId) {
        const waiter = live.pending.get(message.requestId);
        if (waiter) { live.pending.delete(message.requestId); clearTimeout(waiter.timer); message.ok ? waiter.resolve(message.result) : waiter.reject(new Error(message.error)); }
      } else if (message.event === 'status') { live.info = message; this.changed(); }
      else if (message.event === 'notice') this.record(id, message.text);
      else if (message.event === 'chain') {
        if (live.info) live.info = { ...live.info, blockCount: message.blockCount, latestHash: message.block.hash };
        const source = message.source === 'mine' ? '挖矿' : 'P2P 接收';
        this.record(id, `${node.name}：${source}${message.kind === 'replace' ? '长链替换' : '区块追加'}成功，高度 ${message.block.index}，已校验并保存。Hash ${message.block.hash}`);
      }
    };
    child.on('message', receive);
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', (data) => {
      live.logs = (live.logs + data.toString()).slice(-10000);
      // 保留原始错误来源，接收失败不得伪装成同步成功。
      if (/消息无效|连接错误|失败/.test(data.toString())) this.record(id, data.toString().trim());
    });
    const onExit = () => {
      clearInterval(live.heartbeat);
      for (const waiter of live.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('节点进程已退出')); }
      live.pending.clear();
      live.child = null;
      live.info = null;
      if (live.status !== 'stopping' && !this.closing) { live.status = 'error'; live.error ||= '节点进程异常退出，可单独重启'; this.record(id, live.error); }
      else live.status = 'stopped';
      this.changed();
    };
    child.once('exit', onExit);
    child.on('error', (error) => { live.error = error.message; this.record(id, error.message); });
    live.heartbeat = setInterval(() => this.send(child, { action: 'heartbeat' }), 2000);
    try {
      live.info = await this.rpc(id, 'init', { dataDir: path.join(this.dataDir, 'nodes'), id, p2pPort: node.p2pPort, apiPort: node.apiPort });
      live.status = 'running';
      this.persist({ ...this.config, nodes: this.config.nodes.map((item) => item.id === id ? { ...item, running: true, p2pPort: live.info.p2pPort, apiPort: live.info.apiPort } : item) });
      this.record(id, `${node.name} 已启动，链已加载并校验，共 ${live.info.blockCount} 个区块。`, `open ${live.info.p2pPort}\napi ${live.info.apiPort}`);
      if (restore) await this.restoreLinks();
    } catch (error) {
      live.error = error.message;
      live.status = 'error';
      child.kill();
      throw error;
    }
  }
  send(child, message) {
    try { if (child.postMessage) child.postMessage(message); else if (child.connected) child.send(message, () => {}); }
    catch {}
  }
  rpc(id, action, payload = {}) {
    const live = this.live.get(id);
    if (!live?.child) return Promise.reject(new Error('请先启动节点'));
    const requestId = ++live.requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { live.pending.delete(requestId); reject(new Error('节点操作超时，请查看状态后再操作')); }, 20000);
      live.pending.set(requestId, { resolve, reject, timer });
      this.send(live.child, { requestId, action, payload });
    });
  }
  async stop(id, saveIntent = true) {
    this.node(id);
    if (saveIntent) this.persist({ ...this.config, nodes: this.config.nodes.map((node) => node.id === id ? { ...node, running: false } : node) });
    const live = this.live.get(id);
    if (!live?.child) { if (live) live.status = 'stopped'; this.changed(); return; }
    live.status = 'stopping';
    this.changed();
    const child = live.child;
    const exit = once(child, 'exit');
    const timeout = setTimeout(() => child.kill(), 4000);
    try { await this.rpc(id, 'stop'); } catch {}
    await exit;
    clearTimeout(timeout);
    this.record(id, `${this.node(id).name} 已停止，区块文件保留。`, 'exit');
  }
  connected(a, b) {
    const first = this.live.get(a), second = this.live.get(b);
    return first?.info?.peers.some((address) => address === `127.0.0.1:${second?.info?.p2pPort}`) || false;
  }
  async connect(a, b, remember = true) {
    if (a === b) throw new Error('不能连接自己');
    this.node(a); this.node(b);
    const first = this.live.get(a), second = this.live.get(b);
    if (first?.status !== 'running' || second?.status !== 'running') throw new Error('请先启动两个节点');
    if (!this.connected(a, b) && !this.connected(b, a)) {
      first.info = await this.rpc(a, 'connect', { port: second.info.p2pPort });
      this.record(a, `${this.node(a).name} 已与 ${this.node(b).name} 建立 TCP 连接；区块同步以各节点实际接收记录为准。`, `connect 127.0.0.1 ${second.info.p2pPort}`);
    }
    if (remember && !this.config.links.some((link) => link.includes(a) && link.includes(b))) this.persist({ ...this.config, links: [...this.config.links, [a, b]] });
  }
  async restoreLinks() {
    for (const [a, b] of this.config.links) if (this.live.get(a)?.status === 'running' && this.live.get(b)?.status === 'running') {
      try { await this.connect(a, b, false); } catch (error) { this.record(a, `恢复连接失败：${error.message}`); }
    }
  }
  async disconnect(a, b) {
    this.node(a); this.node(b);
    const first = this.live.get(a), second = this.live.get(b);
    if (first?.child && second?.info) first.info = await this.rpc(a, 'disconnect', { port: second.info.p2pPort });
    if (second?.child && first?.info) second.info = await this.rpc(b, 'disconnect', { port: first.info.p2pPort });
    this.persist({ ...this.config, links: this.config.links.filter((link) => !(link.includes(a) && link.includes(b))) });
    this.record(a, `${this.node(a).name} 与 ${this.node(b).name} 已断开；此后挖矿不会沿这条连接同步。`, '关闭这两个节点之间的 TCP socket（原 CLI 无对应命令）');
  }
  action(action, payload = {}) {
    const run = this.queue.then(async () => {
      if (!this.ready || this.closing) throw new Error('实验正在启动或关闭');
      if (this.error) throw new Error(this.error);
      if (action === 'start') await this.start(payload.id);
      else if (action === 'stop') await this.stop(payload.id);
      else if (action === 'connect') await this.connect(payload.id, payload.target);
      else if (action === 'disconnect') await this.disconnect(payload.id, payload.target);
      else if (action === 'add') {
        if (payload.target) this.node(payload.target);
        const number = this.config.nodes.length;
        const node = { id: randomUUID(), name: number < 26 ? String.fromCharCode(65 + number) : `节点${number + 1}`, running: true, p2pPort: null, apiPort: null };
        this.persist({ ...this.config, nodes: [...this.config.nodes, node], links: payload.target ? [...this.config.links, [node.id, payload.target]] : this.config.links });
        await this.start(node.id);
      } else if (action === 'mine') {
        const node = this.node(payload.id);
        const result = await this.rpc(node.id, 'mine', { data: payload.data });
        this.record(node.id, `${node.name} 挖矿完成：nonce ${result.block.nonce}，耗时 ${result.elapsedMs} ms。广播不代表其他节点已经接受。`, `mine ${JSON.stringify(payload.data)}`);
      } else throw new Error('不支持的管理操作');
      return this.snapshot();
    });
    this.queue = run.catch((error) => { this.record(payload.id || null, `操作失败：${error.message}`); });
    return run;
  }
  async close() {
    this.closing = true;
    await this.queue;
    await Promise.all(this.config.nodes.map((node) => this.stop(node.id, false)));
  }
}
module.exports = { ExperimentManager, validConfig };
