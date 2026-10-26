import type { NodeInfo } from '../types'

export function normalizeApiUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('请输入完整 API 地址，例如 http://127.0.0.1:3001')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('API 地址仅支持 HTTP 或 HTTPS')
  if (url.username || url.password) throw new Error('API 地址不能包含用户名或密码')
  if (url.search || url.hash) throw new Error('API 地址不能包含查询参数或片段')
  return url.href.replace(/\/+$/, '')
}

export async function requestJson(
  baseUrl: string,
  path: string,
  signal: AbortSignal,
): Promise<unknown> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`${path} 请求失败（HTTP ${response.status}）`)
    try {
      return (await response.json()) as unknown
    } catch {
      throw new Error(`${path} 返回了无效 JSON`)
    }
  } catch (error) {
    if (signal.aborted) throw error
    if (error instanceof DOMException && error.name === 'TimeoutError')
      throw new Error(`${path} 请求超时，请确认节点服务已开启`)
    if (error instanceof TypeError) throw new Error('无法访问 API，请检查服务、地址及跨域配置')
    throw error
  }
}

export function parseNodeInfo(value: unknown): NodeInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('/nodeInfo 格式无效')
  const source = value as Record<string, unknown>
  const port = (v: unknown): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535
  if (
    !(source.p2pPort === null || port(source.p2pPort)) ||
    !port(source.apiPort) ||
    typeof source.blockCount !== 'number' ||
    !Number.isSafeInteger(source.blockCount) ||
    source.blockCount < 0
  )
    throw new Error('/nodeInfo 字段无效')
  return { p2pPort: source.p2pPort, apiPort: source.apiPort, blockCount: source.blockCount }
}

export function parsePeers(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string'))
    throw new Error('/peers 应返回节点地址数组')
  return [...new Set(value)]
}

export function parseNodeDirectory(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new Error('/nodes 应返回由后端配置的 API 地址数组，请确认后端已更新')
  }
  return [...new Set(value.map(normalizeApiUrl))]
}

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '请求失败，请重试'
