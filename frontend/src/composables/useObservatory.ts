import { computed, onScopeDispose, shallowReactive, shallowRef, watch } from 'vue'
import type { ObservedNode, Resource } from '../types'
import { errorMessage, normalizeApiUrl, parseNodeDirectory, parseNodeInfo, parsePeers, requestJson } from '../lib/api'
import { compareChains, parseBlocks } from '../lib/chain'
import { readPreferences, savePreferences } from '../lib/storage'

function resource<T>(): Resource<T> {
  return shallowReactive({ data: null, pending: false, error: null, updatedAt: null })
}

function createNode(baseUrl: string): ObservedNode {
  return shallowReactive({
    id: baseUrl,
    baseUrl,
    info: resource(),
    blocks: resource(),
    peers: resource(),
    change: 'initial',
    appendedKeys: [],
    revision: 0,
  })
}

export function useObservatory(directoryApi = (typeof window !== 'undefined' && window.__NODE_API_URL__) || import.meta.env.VITE_NODE_API_URL || 'http://127.0.0.1:3001') {
  const preferences = readPreferences()
  const nodes = shallowRef<ObservedNode[]>([])
  const selectedId = shallowRef<string | null>(preferences.selected)
  const autoRefresh = shallowRef(preferences.autoRefresh)
  const directory = resource<string[]>()
  const storageWarning = shallowRef(false)
  const activeNode = computed(
    () => nodes.value.find((node) => node.id === selectedId.value) ?? null,
  )
  let controller: AbortController | null = null
  let applyingDirectory = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let failures = 0
  let disposed = false
  const lastProbe = new Map<string, number>()

  function persist() {
    storageWarning.value = !savePreferences({
      selected: selectedId.value,
      autoRefresh: autoRefresh.value,
    })
  }

  function cancelSampling() {
    generation++
    clearTimeout(timer)
    controller?.abort()
    directory.pending = false
    for (const node of nodes.value) {
      node.info.pending = false
      node.blocks.pending = false
      node.peers.pending = false
    }
  }

  async function load<T>(
    target: Resource<T>,
    baseUrl: string,
    path: string,
    parse: (value: unknown) => T,
    signal: AbortSignal,
    apply?: (data: T) => void,
  ) {
    target.pending = true
    try {
      const data = parse(await requestJson(baseUrl, path, signal))
      if (signal.aborted || disposed) return
      if (apply) apply(data)
      else target.data = data
      target.error = null
      target.updatedAt = Date.now()
    } catch (error) {
      if (!signal.aborted && !disposed) target.error = errorMessage(error)
    } finally {
      if (!signal.aborted && !disposed) target.pending = false
    }
  }

  async function refresh() {
    cancelSampling()
    if (disposed || document.hidden) return
    const ticket = generation
    controller = new AbortController()
    const signal = controller.signal
    directory.pending = true
    try {
      const addresses = parseNodeDirectory(await requestJson(normalizeApiUrl(directoryApi), '/nodes', signal))
      if (signal.aborted || disposed) return
      const existing = new Map(nodes.value.map((node) => [node.id, node]))
      const changed = addresses.length !== nodes.value.length || addresses.some((address, i) => address !== nodes.value[i]?.id)
      if (changed) nodes.value = addresses.map((address) => existing.get(address) ?? createNode(address))
      directory.data = addresses
      directory.error = null
      directory.updatedAt = Date.now()
      applyingDirectory = true
      if (!addresses.includes(selectedId.value ?? '')) selectedId.value = addresses[0] ?? null
      applyingDirectory = false
      persist()
    } catch (error) {
      if (signal.aborted || disposed) return
      directory.error = errorMessage(error)
    } finally {
      if (!signal.aborted && !disposed) directory.pending = false
    }
    const node = activeNode.value
    const work: Promise<void>[] = []
    if (node) {
      work.push(load(node.info, node.baseUrl, '/nodeInfo', parseNodeInfo, signal))
      work.push(load(node.peers, node.baseUrl, '/peers', parsePeers, signal))
      work.push(
        load(node.blocks, node.baseUrl, '/blocks', parseBlocks, signal, (blocks) => {
          const change = compareChains(node.blocks.data, blocks)
          if (change !== 'same') {
            node.appendedKeys =
              change === 'append'
                ? blocks.slice(node.blocks.data?.length ?? 0).map((block) => block.key)
                : []
            node.change = change
            node.blocks.data = blocks
            node.revision++
          }
        }),
      )
      lastProbe.set(node.id, Date.now())
    }
    for (const other of nodes.value) {
      if (other.id !== node?.id && Date.now() - (lastProbe.get(other.id) ?? 0) >= 10000) {
        lastProbe.set(other.id, Date.now())
        work.push(load(other.info, other.baseUrl, '/nodeInfo', parseNodeInfo, signal))
      }
    }
    await Promise.all(work)
    if (ticket !== generation || disposed || signal.aborted) return
    failures = directory.error || (node && (node.info.error || node.blocks.error || node.peers.error)) ? failures + 1 : 0
    if (autoRefresh.value)
      timer = setTimeout(
        () => {
          void refresh()
        },
        Math.min(30000, 2000 * 2 ** Math.min(failures, 4)),
      )
  }

  function selectNode(id: string) {
    if (!nodes.value.some((node) => node.id === id)) return
    failures = 0
    selectedId.value = id
    persist()
  }

  function setAutoRefresh(value: boolean) {
    autoRefresh.value = value
    persist()
  }
  function visibilityChanged() {
    if (document.hidden) cancelSampling()
    else void refresh()
  }
  document.addEventListener('visibilitychange', visibilityChanged)
  watch(
    selectedId,
    () => {
      if (!applyingDirectory) void refresh()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(autoRefresh, (enabled) => {
    if (enabled) void refresh()
    else cancelSampling()
  })
  onScopeDispose(() => {
    disposed = true
    cancelSampling()
    document.removeEventListener('visibilitychange', visibilityChanged)
  })

  return {
    nodes,
    activeNode,
    autoRefresh,
    directory,
    directoryApi,
    storageWarning,
    selectNode,
    refresh,
    setAutoRefresh,
  }
}
