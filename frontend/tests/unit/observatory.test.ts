import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useObservatory } from '../../src/composables/useObservatory'

const a = 'http://127.0.0.1:3001', b = 'http://127.0.0.1:3002'
const genesis = { index: 0, hash: 'a'.repeat(64), previousHash: '0', timestamp: 1508270000000, nonce: 1, data: 'Genesis Block' }
const nodeInfo = { p2pPort: 2727, apiPort: 3001, blockCount: 1 }
let addresses: string[]
let documentStub: EventTarget & { hidden: boolean }
const scopes: ReturnType<typeof effectScope>[] = []
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); await nextTick() }
const create = () => { const scope = effectScope(); scopes.push(scope); return scope.run(() => useObservatory(a))! }
const answer = async (input: string) => new Response(JSON.stringify(input.endsWith('/nodes') ? addresses : input.endsWith('/nodeInfo') ? nodeInfo : input.endsWith('/blocks') ? [genesis] : []))

beforeEach(() => {
  vi.useFakeTimers()
  addresses = [a]
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) })
  documentStub = Object.assign(new EventTarget(), { hidden: false })
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('fetch', vi.fn(answer))
})
afterEach(() => { scopes.splice(0).forEach((scope) => scope.stop()); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('后端目录驱动的节点采样', () => {
  it('自动读取后端目录，没有前端添加/删除能力', async () => {
    const state = create(); await flush()
    expect(state.nodes.value).toHaveLength(1)
    expect(state.activeNode.value?.blocks.data?.[0]?.data).toBe('Genesis Block')
    expect('addNode' in state).toBe(false)
    expect('removeNode' in state).toBe(false)
  })
  it('忽略旧 localStorage 地址，保存时移除 addresses 字段', async () => {
    localStorage.setItem('blockchain-observatory:v1', JSON.stringify({ addresses: [b], selected: b, autoRefresh: true }))
    const state = create(); await flush()
    expect(state.nodes.value.map((node) => node.id)).toEqual([a])
    expect(state.activeNode.value?.id).toBe(a)
    expect(JSON.parse(localStorage.getItem('blockchain-observatory:v1')!).addresses).toBeUndefined()
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).startsWith(b))).toBe(false)
  })
  it('跟随后端增删，保留已有实例，移除选中节点后回到剩余节点', async () => {
    const state = create(); await flush()
    const initial = state.nodes.value[0]
    addresses = [a, b]
    await state.refresh()
    expect(state.nodes.value[0]).toBe(initial)
    expect(state.nodes.value).toHaveLength(2)
    state.selectNode(b); await flush()
    expect(state.activeNode.value?.id).toBe(b)
    addresses = [a]
    await state.refresh()
    expect(state.activeNode.value?.id).toBe(a)
    expect(state.nodes.value).toHaveLength(1)
  })
  it('相同快照保留引用，部分失败保留旧快照', async () => {
    const state = create(); await flush()
    const before = state.activeNode.value!.blocks.data
    await state.refresh()
    expect(state.activeNode.value!.blocks.data).toBe(before)
    vi.mocked(fetch).mockImplementation(async (input) => String(input).endsWith('/peers') ? new Response('[]', { status: 503 }) : answer(String(input)))
    await state.refresh()
    expect(state.activeNode.value!.peers.error).toContain('HTTP 503')
    expect(state.activeNode.value!.peers.data).toEqual([])
    expect(state.activeNode.value!.blocks.data).toBe(before)
  })
  it('目录失败保留旧名单，首次失败不从浏览器旧地址补造节点', async () => {
    const state = create(); await flush()
    vi.mocked(fetch).mockImplementation(async (input) => String(input).endsWith('/nodes') ? new Response('[]', { status: 500 }) : answer(String(input)))
    await state.refresh()
    expect(state.directory.error).toContain('HTTP 500')
    expect(state.nodes.value).toHaveLength(1)
    scopes[0]!.stop()
    const fresh = create(); await flush()
    expect(fresh.nodes.value).toHaveLength(0)
    expect(fresh.directory.error).toContain('HTTP 500')
  })
  it('切换后的迟到旧响应不能覆盖新节点', async () => {
    addresses = [a, b]
    const state = create(); await flush()
    let release: ((response: Response) => void) | undefined
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input) === `${a}/blocks`) return new Promise<Response>((resolve) => { release = resolve })
      if (String(input) === `${b}/blocks`) return new Response(JSON.stringify([{ ...genesis, data: '节点 B' }]))
      return answer(String(input))
    })
    const old = state.refresh(); await flush()
    state.selectNode(b); await flush()
    release?.(new Response(JSON.stringify([{ ...genesis, data: '迟到 A' }])))
    await old
    expect(state.activeNode.value!.blocks.data?.[0]?.data).toBe('节点 B')
    expect(state.nodes.value[0]!.blocks.data?.[0]?.data).toBe('Genesis Block')
  })
  it('页面隐藏与关闭自动刷新停止请求，可见时重新采样', async () => {
    const state = create(); await flush()
    documentStub.hidden = true; documentStub.dispatchEvent(new Event('visibilitychange'))
    const calls = vi.mocked(fetch).mock.calls.length
    await vi.advanceTimersByTimeAsync(30000)
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
    documentStub.hidden = false; documentStub.dispatchEvent(new Event('visibilitychange')); await flush()
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(calls)
    state.setAutoRefresh(false); await flush()
    const stopped = vi.mocked(fetch).mock.calls.length
    await vi.advanceTimersByTimeAsync(30000)
    expect(vi.mocked(fetch).mock.calls.length).toBe(stopped)
  })
  it('失败退避与销毁清理', async () => {
    const state = create(); await flush()
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'))
    await state.refresh()
    const calls = vi.mocked(fetch).mock.calls.length
    await vi.advanceTimersByTimeAsync(3999)
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
    await vi.advanceTimersByTimeAsync(1)
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls + 4)
    scopes[0]!.stop()
    const stopped = vi.mocked(fetch).mock.calls.length
    await vi.advanceTimersByTimeAsync(60000)
    expect(vi.mocked(fetch).mock.calls.length).toBe(stopped)
  })
  it('未完成采样不产生重叠轮询', async () => {
    let release: ((response: Response) => void) | undefined
    vi.mocked(fetch).mockImplementation(async (input) => String(input).endsWith('/blocks') ? new Promise<Response>((resolve) => { release = resolve }) : answer(String(input)))
    create(); await flush()
    const calls = vi.mocked(fetch).mock.calls.length
    await vi.advanceTimersByTimeAsync(4000)
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls)
    release?.(new Response(JSON.stringify([genesis]))); await flush()
    await vi.advanceTimersByTimeAsync(2000)
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls + 4)
  })
  it('非当前节点十秒探测，存储受限仍可读取后端目录', async () => {
    addresses = [a, b]
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('denied') })
    const state = create(); await flush()
    expect(state.storageWarning.value).toBe(true)
    const probes = () => vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === `${b}/nodeInfo`).length
    const before = probes()
    await vi.advanceTimersByTimeAsync(9000)
    expect(probes()).toBe(before)
    await vi.advanceTimersByTimeAsync(1000)
    expect(probes()).toBe(before + 1)
  })
})
