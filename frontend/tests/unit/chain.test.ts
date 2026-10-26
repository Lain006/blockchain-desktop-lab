import { describe, expect, it } from 'vitest'
import { chainLinks, compareChains, findBlock, formatTimestamp, parseBlocks, validTimestamp } from '../../src/lib/chain'
import { normalizeApiUrl, parseNodeDirectory, parseNodeInfo, parsePeers } from '../../src/lib/api'

const hash = (index: number) => index.toString(16).padStart(64, '0')
const raw = (index: number) => ({ index, hash: hash(index), previousHash: index === 0 ? '0' : hash(index - 1), timestamp: 1508270000000 + index, nonce: 12, data: `区块 ${index}` })

describe('真实字段与链引用', () => {
  it('保留六个字段，以毫秒格式化时间，不二次乘 1000', () => {
    const [block] = parseBlocks([raw(0)])
    expect(block?.timestamp).toBe(1508270000000)
    expect(block?.issues).toEqual([])
    expect(formatTimestamp(block!.timestamp)).toContain('2017')
    expect(validTimestamp('1508270000000')).toBe(false)
    expect(formatTimestamp(-1)).toBe('时间戳无效')
    expect(formatTimestamp(Number.NaN)).toBe('时间戳无效')
    expect(formatTimestamp(8640000000000000)).toContain('超出常用年份')
  })
  it('只连接真实相邻哈希及连续高度', () => {
    const blocks = parseBlocks([raw(0), raw(1), { ...raw(2), previousHash: hash(8) }])
    expect(chainLinks(blocks).map((link) => [link.from, link.to])).toEqual([[0, 1]])
    expect(chainLinks(parseBlocks([raw(0), { ...raw(1), index: 7 }]))).toEqual([])
  })
  it('重复、缺失与畸形区块不制造正常引用', () => {
    const blocks = parseBlocks([raw(0), raw(0), null, { index: 4, timestamp: 'bad' }])
    expect(new Set(blocks.map((block) => block.key)).size).toBe(4)
    expect(blocks[0]?.issues.join()).toContain('Hash 重复')
    expect(blocks[2]?.issues.length).toBeGreaterThan(0)
    expect(chainLinks(blocks)).toEqual([])
    expect(() => parseBlocks({})).toThrow('数组')
  })
  it('区分首次读取、重复快照、真实追加、等高变化与链重置', () => {
    const a = parseBlocks([raw(0), raw(1)])
    expect(compareChains(null, a)).toBe('initial')
    expect(compareChains(a, parseBlocks([raw(0), raw(1)]))).toBe('same')
    expect(compareChains(a, parseBlocks([raw(0), raw(1), raw(2)]))).toBe('append')
    expect(compareChains(a, parseBlocks([raw(0), { ...raw(1), data: 'changed' }]))).toBe('replace')
    expect(compareChains(a, parseBlocks([raw(0)]))).toBe('replace')
    expect(compareChains([], a)).toBe('replace')
    expect(compareChains(a, parseBlocks([raw(0), raw(1), { ...raw(2), timestamp: null }]))).toBe('replace')
  })
  it('保留空字符串及可能含 HTML 的 Data，支持精确搜索', () => {
    const blocks = parseBlocks([{ ...raw(0), data: '' }, { ...raw(1), data: '<script>alert(1)</script>' }])
    expect(blocks[0]?.data).toBe('')
    expect(blocks[1]?.data).toBe('<script>alert(1)</script>')
    expect(findBlock(blocks, '#1')?.hash).toBe(hash(1))
    expect(findBlock(blocks, hash(0))?.index).toBe(0)
    expect(findBlock(blocks, '')).toBeUndefined()
  })
})

describe('API 输入边界', () => {
  it('后端目录去重并拒绝畸形目录与凭据地址', () => {
    expect(parseNodeDirectory(['http://127.0.0.1:3001/', 'http://127.0.0.1:3001'])).toEqual(['http://127.0.0.1:3001'])
    expect(() => parseNodeDirectory({ nodes: [] })).toThrow()
    expect(() => parseNodeDirectory(['http://user:pass@localhost:3001'])).toThrow()
  })
  it('规范化地址，拒绝凭据、脚本及查询参数', () => {
    expect(normalizeApiUrl(' http://LOCALHOST:3001/ ')).toBe('http://localhost:3001')
    for (const value of ['javascript:alert(1)', 'http://user:pass@localhost:3001', 'localhost:3001', 'http://localhost:3001/?key=abc', 'http://localhost:3001/#x']) expect(() => normalizeApiUrl(value)).toThrow()
  })
  it('节点身份及 peer 响应严格校验，零 peer 不等于 API 断线', () => {
    expect(parseNodeInfo({ p2pPort: null, apiPort: 3001, blockCount: 1 }).p2pPort).toBeNull()
    expect(parsePeers([])).toEqual([])
    expect(parsePeers(['127.0.0.1:2727', '127.0.0.1:2727'])).toHaveLength(1)
    expect(() => parsePeers([null])).toThrow()
    expect(() => parseNodeInfo({ p2pPort: 0, apiPort: 3001, blockCount: 1 })).toThrow()
  })
})
