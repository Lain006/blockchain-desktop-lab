import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import type { LabAction, LabPayload, LabState } from './types'

export function useLab() {
  const state = shallowRef<LabState>({ ready: false, error: null, dataDir: '', nodes: [], links: [], events: [], observationUrl: null })
  const selectedId = shallowRef('')
  const busy = shallowRef(false)
  const error = shallowRef('')
  const active = computed(() => state.value.nodes.find((node) => node.id === selectedId.value) ?? state.value.nodes[0])
  function receive(next: LabState) { state.value = next }
  let unsubscribe: (() => void) | undefined
  onMounted(async () => {
    unsubscribe = window.lab.subscribe(receive)
    try { receive(await window.lab.action('state')) } catch (reason) { error.value = String(reason) }
  })
  onUnmounted(() => unsubscribe?.())
  async function perform(action: LabAction, payload: LabPayload = {}) {
    busy.value = true
    error.value = ''
    try { receive(await window.lab.action(action, payload)); return true }
    catch (reason) { error.value = reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(reason); return false }
    finally { busy.value = false }
  }
  return { state, selectedId, active, busy, error, perform }
}
