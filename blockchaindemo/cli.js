const readline = require("node:readline");
const NodeRuntime = require("./runtime");

const HELP = `命令：
  help                       显示帮助
  open <port> (o)            开启 P2P 端口，例如 open 2727
  connect <host> <port> (c)  连接节点，例如 connect localhost 2727
  discover (d)              显示节点发现说明（当前需手动连接）
  blockchain (bc)           查看完整区块链
  peers (p)                查看已连接节点
  mine <data> (m)           挖矿并广播，例如 mine "1111"
  api <port> (a)            开启本机 HTTP API，例如 api 3001
  observe <apiUrl>          后端添加观测地址，例如 observe http://127.0.0.1:3002
  unobserve <apiUrl>        后端移除观测地址，不断开 P2P
  nodes                    查看后端提供的观测节点目录
  exit                     关闭服务并退出`;

function parsePort(value) {
  if (!/^\d+$/.test(String(value))) throw new Error("端口必须为 1 至 65535 的整数");
  const port = Number(value);
  if (port < 1 || port > 65535) throw new Error("端口必须为 1 至 65535 的整数");
  return port;
}

function parseApiUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("请输入完整 HTTP API 地址"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("API 地址须为 HTTP(S)，且不能包含凭据、查询参数或片段");
  }
  return url.href.replace(/\/+$/, "");
}

// 保留数据的字符串类型；引号只负责包裹文本，不执行其中的代码。
function parseData(value) {
  if (!value) throw new Error('用法：mine "区块数据"');
  const pairs = { '"': '"', "'": "'", "“": "”" };
  if (pairs[value[0]]) {
    if (value.length < 2 || value.at(-1) !== pairs[value[0]]) {
      throw new Error("数据引号未闭合");
    }
    return value.slice(1, -1);
  }
  return value;
}

function cli({ input = process.stdin, output = process.stdout } = {}) {
  const runtime = new NodeRuntime({ log: (value) => output.write(`${value}\n`) });
  const { blockchain, p2p, observedApis } = runtime;
  let closed = false;
  let stopping = false;
  const rl = readline.createInterface({ input, output, prompt: "blockchain>>>>>>>>> " });
  const log = (value) => output.write(`${value}\n`);

  const nodeDirectory = () => runtime.directory();
  const peerAddresses = () => runtime.peers();
  const connect = (host, port) => runtime.connect(host, parsePort(port));
  const mine = (data) => runtime.mine(data);
  const initHttpServer = (port) => runtime.api(port);

  async function execute(line) {
    const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(line.trim());
    if (!match) return;
    const aliases = { c: "connect", d: "discover", bc: "blockchain", p: "peers", m: "mine", o: "open", a: "api" };
    const command = aliases[match[1]] || match[1];
    const arg = match[2] || "";
    if (!["mine", "open", "api", "connect", "observe", "unobserve"].includes(command) && arg) {
      throw new Error("该命令不接受参数，请输入 help 查看用法");
    }
    switch (command) {
      case "help": log(HELP); break;
      case "open": {
        await runtime.open(parsePort(arg));
        break;
      }
      case "connect": {
        const args = arg.split(/\s+/);
        if (args.length !== 2) throw new Error("用法：connect localhost 2727");
        await connect(args[0], args[1]);
        break;
      }
      case "discover": p2p.discoverPeers(); break;
      case "blockchain":
        log(JSON.stringify({ blockchain: blockchain.get(), difficulty: blockchain.difficulty }, null, 2));
        break;
      case "peers": log(peerAddresses().join("\n") || "当前没有已连接节点"); break;
      case "mine": log(`挖矿成功：${JSON.stringify(mine(parseData(arg)))}`); break;
      case "api": await initHttpServer(parsePort(arg)); break;
      case "observe": {
        const address = parseApiUrl(arg);
        observedApis.add(address);
        log(`观测地址已配置：${address}（P2P 建连仍使用 connect）`);
        break;
      }
      case "unobserve": {
        const address = parseApiUrl(arg);
        if (runtime.apiServer?.listening && address === `http://127.0.0.1:${runtime.apiServer.address().port}`) {
          throw new Error("当前节点自身 API 自动提供，不能移除");
        }
        if (!observedApis.delete(address)) throw new Error("该观测地址尚未配置");
        log(`观测地址已移除：${address}（P2P 连接不受影响）`);
        break;
      }
      case "nodes": log(JSON.stringify(nodeDirectory(), null, 2)); break;
      case "exit": rl.close(); break;
      default: throw new Error("未知命令，请输入 help 查看帮助（查看链请拼写 blockchain）");
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    input.pause();
    void runtime.close();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
  function stop() { rl.close(); }
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  rl.on("SIGINT", stop);
  // 串行执行命令，确保 open 完成后再连接，避免粘贴多行时发生竞态。
  let queue = Promise.resolve();
  rl.on("line", (line) => {
    queue = queue.then(async () => {
      if (closed) return;
      try { await execute(line); }
      catch (err) { log(`操作失败：${err.message}`); }
      if (!closed && !stopping) rl.prompt();
    });
  });
  rl.on("close", () => { stopping = true; queue.then(close); });
  log("欢迎来到blockchain命令行界面");
  log(HELP);
  rl.prompt();
  return { blockchain, p2p, close: stop };
}

module.exports = cli;
