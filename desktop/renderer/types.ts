export interface NodeInfo {
  p2pPort: number | null; apiPort: number | null; blockCount: number; peers: string[]; latestHash: string; saved: boolean
}
export interface LabNode {
  id: string; name: string; running: boolean; status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error'
  info: NodeInfo | null; error: string | null; logs: string
}
export interface LabEvent { id: number; nodeId: string | null; time: number; text: string; command: string }
export interface LabState {
  ready: boolean; error: string | null; dataDir: string; nodes: LabNode[]; links: [string, string][]; events: LabEvent[]; observationUrl: string | null
}
export type LabAction = 'state' | 'openObservation' | 'openData' | 'start' | 'stop' | 'connect' | 'disconnect' | 'add' | 'mine'
export interface LabPayload { id?: string; target?: string; data?: string }
declare global {
  interface Window {
    lab: { action(action: LabAction, payload?: LabPayload): Promise<LabState>; subscribe(callback: (state: LabState) => void): () => void }
  }
}
