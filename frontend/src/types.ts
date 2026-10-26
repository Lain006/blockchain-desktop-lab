export interface BlockRecord {
  key: string
  index: number | null
  hash: string | null
  previousHash: string | null
  data: string | null
  nonce: number | null
  timestamp: number | string | null
  issues: string[]
}

export interface NodeInfo {
  p2pPort: number | null
  apiPort: number
  blockCount: number
}

export interface Resource<T> {
  data: T | null
  pending: boolean
  error: string | null
  updatedAt: number | null
}

export interface ObservedNode {
  id: string
  baseUrl: string
  info: Resource<NodeInfo>
  blocks: Resource<BlockRecord[]>
  peers: Resource<string[]>
  change: 'initial' | 'same' | 'append' | 'replace'
  appendedKeys: string[]
  revision: number
}

export interface CameraState {
  x: number
  y: number
  zoom: number
}
export interface ChainLink {
  from: number
  to: number
  key: string
}
