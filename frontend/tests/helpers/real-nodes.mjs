import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

export async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

export async function until(check, description = '条件', timeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try { if (await check()) return } catch { /* 节点启动和网络同步是异步过程，截止前继续检查。 */ }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`等待超时：${description}`)
}

export async function startNode(options = {}) {
  const p2pPort = options.p2pPort ?? await freePort()
  const apiPort = options.apiPort ?? await freePort()
  const child = spawn(process.execPath, ['index.js'], { cwd: fileURLToPath(new URL('../../../blockchaindemo/', import.meta.url)), stdio: 'pipe', windowsHide: true })
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (text) => { output = (output + text).slice(-16000) })
  child.stderr.setEncoding('utf8').on('data', (text) => { output = (output + text).slice(-16000) })
  const api = `http://127.0.0.1:${apiPort}`
  const send = (command) => child.stdin.write(`${command}\n`)
  const blocks = async () => (await fetch(`${api}/blocks`, { signal: AbortSignal.timeout(2000) })).json()
  async function stop() {
    if (child.exitCode !== null) return
    const exited = once(child, 'exit')
    send('exit')
    const timeout = setTimeout(() => { child.kill() }, 2000)
    await exited
    clearTimeout(timeout)
  }
  send(`open ${p2pPort}`)
  send(`api ${apiPort}`)
  try {
    await until(async () => (await fetch(`${api}/nodeInfo`)).ok, '真实节点 HTTP 启动')
    const info = await (await fetch(`${api}/nodeInfo`)).json()
    if (info.p2pPort !== p2pPort) throw new Error(`P2P 端口 ${p2pPort} 未成功启动；保留已占用端口的现有进程`)
  } catch (error) { await stop(); throw new Error(`${error.message}\n${output}`) }
  return { child, api, apiPort, p2pPort, send, blocks, stop, output: () => output }
}

export async function createNetwork() {
  const a = await startNode()
  let b
  try {
    a.send('mine "链上观测站 · 第一个真实区块"')
    a.send('mine "每一个区块，都延续着上一个。"')
    await until(async () => (await a.blocks()).length === 3, '真实挖矿')
    b = await startNode()
    b.send(`connect localhost ${a.p2pPort}`)
    await until(async () => (await b.blocks()).length === 3, '双节点 P2P 同步')
    return { a, b, stop: async () => { await Promise.all([a.stop(), b.stop()]) } }
  } catch (error) { await a.stop(); if (b) await b.stop(); throw error }
}
