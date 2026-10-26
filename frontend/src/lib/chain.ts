import type { BlockRecord, ChainLink } from '../types'

export const HASH_PATTERN = /^[0-9a-f]{64}$/
const safeNatural = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

export function parseBlocks(payload: unknown): BlockRecord[] {
  if (!Array.isArray(payload)) throw new Error('/blocks 应返回区块数组')
  const counts = new Map<string, number>()
  for (const item of payload) {
    if (isRecord(item) && typeof item.hash === 'string')
      counts.set(item.hash, (counts.get(item.hash) ?? 0) + 1)
  }
  return payload.map((item: unknown, position): BlockRecord => {
    const source = isRecord(item) ? item : {}
    const hash = typeof source.hash === 'string' ? source.hash : null
    const previousHash = typeof source.previousHash === 'string' ? source.previousHash : null
    const index = safeNatural(source.index) ? source.index : null
    const nonce = safeNatural(source.nonce) ? source.nonce : null
    const timestamp =
      typeof source.timestamp === 'number' || typeof source.timestamp === 'string'
        ? source.timestamp
        : null
    const data = typeof source.data === 'string' ? source.data : null
    const issues: string[] = []
    if (index === null) issues.push('高度缺失或无效')
    if (!hash || !HASH_PATTERN.test(hash)) issues.push('Hash 缺失或格式无效')
    if (hash && (counts.get(hash) ?? 0) > 1) issues.push('Hash 重复，无法唯一关联')
    if (index === 0 ? previousHash !== '0' : !previousHash || !HASH_PATTERN.test(previousHash))
      issues.push('Prev Hash 缺失或格式无效')
    if (nonce === null) issues.push('Nonce 缺失或无效')
    if (!validTimestamp(timestamp)) issues.push('时间戳无效：应为毫秒整数')
    if (data === null) issues.push('Data 缺失或不是字符串')
    return {
      key:
        hash && HASH_PATTERN.test(hash) && counts.get(hash) === 1
          ? hash
          : `invalid:${position}:${hash ?? 'missing'}`,
      index,
      hash,
      previousHash,
      data,
      nonce,
      timestamp,
      issues,
    }
  })
}

export function validTimestamp(value: unknown): value is number {
  return safeNatural(value) && value <= 8640000000000000
}

export function formatTimestamp(value: BlockRecord['timestamp']): string {
  if (!validTimestamp(value)) return '时间戳无效'
  const date = new Date(value)
  // 后端协议固定为毫秒，不根据数值长度猜测并转换单位。
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    return `${date.toISOString()}（超出常用年份）`
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date)
}

export function shortHash(value: string | null, length = 8): string {
  if (value === null) return '字段缺失'
  return value.length > length * 2 + 3 ? `${value.slice(0, length)}…${value.slice(-length)}` : value
}

export function chainLinks(blocks: readonly BlockRecord[]): ChainLink[] {
  const links: ChainLink[] = []
  for (let to = 1; to < blocks.length; to++) {
    const current = blocks[to]!
    const previous = blocks[to - 1]!
    if (
      previous.hash &&
      HASH_PATTERN.test(previous.hash) &&
      !previous.key.startsWith('invalid:') &&
      !current.key.startsWith('invalid:') &&
      current.previousHash === previous.hash &&
      previous.index !== null &&
      current.index === previous.index + 1
    ) {
      links.push({ from: to - 1, to, key: `${previous.key}:${current.key}` })
    }
  }
  return links
}

export function compareChains(
  before: readonly BlockRecord[] | null,
  after: readonly BlockRecord[],
): 'initial' | 'same' | 'append' | 'replace' {
  if (before === null) return 'initial'
  const equal = (a: BlockRecord, b: BlockRecord) =>
    a.key === b.key &&
    a.index === b.index &&
    a.hash === b.hash &&
    a.previousHash === b.previousHash &&
    a.data === b.data &&
    a.nonce === b.nonce &&
    a.timestamp === b.timestamp
  const prefix =
    after.length >= before.length && before.every((block, i) => equal(block, after[i]!))
  if (prefix && before.length === after.length) return 'same'
  if (
    prefix &&
    before.length > 0 &&
    after.length > before.length &&
    after.every((block) => block.issues.length === 0) &&
    chainLinks(after).length === after.length - 1
  )
    return 'append'
  return 'replace'
}

export function findBlock(blocks: readonly BlockRecord[], input: string): BlockRecord | undefined {
  const query = input.trim().replace(/^#/, '')
  if (!query) return undefined
  return blocks.find(
    (block) => block.hash === query || (/^\d+$/.test(query) && block.index === Number(query)),
  )
}

export function sampleTime(value: number | null): string {
  return value === null
    ? '尚未采样'
    : new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(value)
}
