const path = require('node:path');
const NodeRuntime = require('../blockchaindemo/runtime');
const Blockchain = require('../blockchaindemo/Blockchain');
const jsonStore = require('../blockchaindemo/json-store');
const port = process.parentPort;
const send = (value) => { if (port) port.postMessage(value); else if (process.connected) process.send(value); };
let runtime;
let lastHeartbeat = Date.now();
let stopping = false;
let queue = Promise.resolve();

async function listenWithFallback(start, preferred) {
  try { return await start(preferred || 0); }
  catch (error) {
    if (!preferred || !['EADDRINUSE', 'EACCES'].includes(error.code)) throw error;
    send({ event: 'notice', text: `原端口 ${preferred} 不可用，已自动选择空闲端口。` });
    return start(0);
  }
}
function status() {
  return { ...runtime.info(), peers: runtime.peers(), latestHash: runtime.blockchain.latestBlock.hash, saved: true };
}
async function handle(message) {
  if (message?.action === 'heartbeat') { lastHeartbeat = Date.now(); return; }
  const { requestId, action, payload = {} } = message || {};
  try {
    let result;
    if (action === 'init' && !runtime) {
      const validator = new Blockchain();
      const storage = jsonStore(path.join(payload.dataDir, `${payload.id}.json`), (chain) => validator.isValidChain(chain),
        (text) => send({ event: 'notice', text }));
      runtime = new NodeRuntime({ storage });
      runtime.on('chain', (data) => send({ event: 'chain', ...data }));
      await listenWithFallback((value) => runtime.open(value), payload.p2pPort);
      await listenWithFallback((value) => runtime.api(value), payload.apiPort);
      result = status();
    } else {
      if (!runtime) throw new Error('节点尚未启动');
      if (action === 'mine') {
        if (typeof payload.data !== 'string' || Buffer.byteLength(payload.data, 'utf8') > 8192) throw new Error('区块内容须为不超过 8 KiB 的文本');
        const start = Date.now();
        result = { block: runtime.mine(payload.data), elapsedMs: Date.now() - start };
      } else if (action === 'connect') { await runtime.connect('127.0.0.1', payload.port); result = status(); }
      else if (action === 'disconnect') { await runtime.disconnect(payload.port); result = status(); }
      else if (action === 'status') result = status();
      else if (action === 'stop') { stopping = true; await runtime.close(); result = true; }
      else throw new Error('不支持的节点操作');
    }
    send({ requestId, ok: true, result });
    if (action === 'stop') setTimeout(() => process.exit(0), 30);
  } catch (error) {
    send({ requestId, ok: false, error: error.message });
    send({ event: 'notice', text: error.message });
  }
}
function receive(message) {
  if (message?.action === 'heartbeat') { lastHeartbeat = Date.now(); return; }
  queue = queue.then(() => handle(message)).catch((error) => send({ event: 'notice', text: error.message }));
}
if (port) port.on('message', (event) => receive(event.data));
else {
  process.on('message', receive);
  process.on('disconnect', () => { void runtime?.close().finally(() => process.exit(0)); });
}
setInterval(() => {
  if (Date.now() - lastHeartbeat > 15000) { void runtime?.close().finally(() => process.exit(0)); return; }
  if (runtime && !stopping) send({ event: 'status', ...status() });
}, 400).unref();
