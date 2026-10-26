const { once, EventEmitter } = require('node:events');
const express = require('express');
const cors = require('cors');
const Blockchain = require('./Blockchain');
const P2p = require('./P2p');

class NodeRuntime extends EventEmitter {
  constructor({ storage, log = () => {} } = {}) {
    super();
    this.log = log;
    this.observedApis = new Set();
    this.pending = new Set();
    this.apiServer = null;
    this.mining = false;
    this.closed = false;
    this.blockchain = new Blockchain({ storage, onChange: (event) => {
      this.emit('chain', { ...event, source: this.mining ? 'mine' : 'peer' });
    } });
    this.p2p = new P2p(this.blockchain);
  }
  directory() {
    const own = this.apiServer?.listening ? `http://127.0.0.1:${this.apiServer.address().port}` : null;
    return [...new Set([...(own ? [own] : []), ...this.observedApis])];
  }
  peers() {
    return this.p2p.peers.filter((peer) => !peer.destroyed).map((peer) =>
      `${peer.peerInfo?.host || peer.remoteAddress}:${peer.peerInfo?.port || peer.remotePort}`);
  }
  info() {
    return { p2pPort: this.p2p.serverPort, apiPort: this.apiServer?.address()?.port ?? null,
      blockCount: this.blockchain.get().length };
  }
  async open(port) {
    const server = this.p2p.startServer(port);
    try { await once(server, 'listening'); }
    catch (error) { this.p2p.server = null; this.p2p.serverPort = null; throw error; }
    return this.p2p.serverPort;
  }
  async connect(host, port) {
    if (typeof host !== 'string' || !host.trim() || /\s/.test(host)) throw new Error('节点主机名无效');
    const socket = this.p2p.connectToPeer(host === 'localhost' ? '127.0.0.1' : host, port);
    this.pending.add(socket);
    socket.setTimeout(5000, () => socket.destroy(new Error('连接节点超时')));
    try { await once(socket, 'connect'); socket.setTimeout(0); }
    finally { this.pending.delete(socket); }
  }
  async disconnect(port) {
    await Promise.all(this.p2p.peers.filter((peer) => peer.peerInfo?.port === port || peer.targetPort === port).map(async (peer) => {
      const closed = once(peer, 'close').catch(() => {});
      peer.destroy();
      await closed;
    }));
  }
  mine(data) {
    this.mining = true;
    try {
      const block = this.blockchain.mine(data);
      this.p2p.broadcastLatest();
      return block;
    } finally { this.mining = false; }
  }
  async api(port) {
    if (this.apiServer) throw new Error('HTTP API 已启动');
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '16kb' }));
    app.get('/blocks', (req, res) => res.json(this.blockchain.get()));
    app.get('/peers', (req, res) => res.json(this.peers()));
    app.get('/nodes', (req, res) => res.json(this.directory()));
    app.get('/nodeInfo', (req, res) => res.json(this.info()));
    app.post('/mineBlock', (req, res) => {
      if (typeof req.body?.data !== 'string') return res.status(400).json({ error: 'data 必须为字符串' });
      res.json(this.mine(req.body.data));
    });
    app.post('/addPeer', async (req, res) => {
      let { host, port: targetPort, peer } = req.body || {};
      if (typeof peer === 'string') {
        const match = /^([^\s:]+):(\d+)$/.exec(peer);
        if (!match) return res.status(400).json({ error: 'peer 格式应为 localhost:2727' });
        [, host, targetPort] = match;
      }
      try {
        if (!/^\d+$/.test(String(targetPort)) || Number(targetPort) < 1 || Number(targetPort) > 65535) throw new Error('端口必须为 1 至 65535 的整数');
        await this.connect(host, Number(targetPort));
        res.json({ message: '节点已连接' });
      } catch (error) { res.status(400).json({ error: error.message }); }
    });
    app.use((error, req, res, next) => res.status(error.status === 413 ? 413 : 400).json({ error: '请求内容无效' }));
    const server = app.listen(port, '127.0.0.1');
    this.apiServer = server;
    server.on('error', (error) => this.log(`HTTP 服务错误：${error.message}`));
    try { await once(server, 'listening'); }
    catch (error) { this.apiServer = null; throw error; }
    this.log(`HTTP API 已启动：http://127.0.0.1:${server.address().port}`);
    return server.address().port;
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const socket of this.pending) socket.destroy();
    const servers = [this.p2p.server, this.apiServer].filter(Boolean);
    const waits = servers.map((server) => once(server, 'close').catch(() => {}));
    this.p2p.closeConnection();
    this.apiServer?.close();
    this.apiServer?.closeAllConnections();
    await Promise.all(waits);
  }
}
module.exports = NodeRuntime;
