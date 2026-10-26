<script setup lang="ts">
import { computed, nextTick, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import type { BlockRecord } from '../types'
import AppIcon from './AppIcon.vue'
import BlockDetails from './BlockDetails.vue'
const props = defineProps<{
  block: BlockRecord | null
  previous: BlockRecord | null
  next: BlockRecord | null
  openRequest: number
  nodeId: string
}>()
const emit = defineEmits<{ select: [key: string]; locate: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('mobileDialog')
const dialogOpen = shallowRef(false)
const indexLabel = computed(() =>
  props.block ? `检查区块 #${props.block.index ?? '?'}` : '选择区块查看详情',
)
const media = window.matchMedia('(max-width: 767px)')
const open = async () => {
  if (!props.block || !dialog.value || dialog.value.open) return
  dialogOpen.value = true
  await nextTick()
  dialog.value?.showModal()
}
const close = () => {
  dialog.value?.close()
  dialogOpen.value = false
}
function locateInChain() {
  close()
  emit('locate')
}
const resized = () => {
  if (!media.matches) close()
}
media.addEventListener('change', resized)
watch(
  () => props.openRequest,
  () => {
    if (media.matches) open()
  },
)
watch(() => props.nodeId, close)
onScopeDispose(() => {
  media.removeEventListener('change', resized)
  close()
})
</script>

<template>
  <aside class="inspector" aria-label="区块检查器">
    <header class="inspector-heading">
      <h2>区块检查器</h2>
      <AppIcon name="cube" />
    </header>
    <Transition name="inspect" mode="out-in"
      ><BlockDetails
        v-if="block"
        :key="`${nodeId}:${block.key}`"
        :block="block"
        :previous="previous"
        :next="next"
        @select="emit('select', $event)"
        @locate="emit('locate')"
      />
      <div v-else class="inspector-empty">
        <AppIcon name="cube" />
        <p>选择链中的一个区块，<br />检查它的字段与前后关联。</p>
        <span>完整 Hash、Data 与时间戳<br />会直接来自节点输出。</span>
      </div></Transition
    >
    <p class="inspector-note">连线用于展示哈希引用；本页面不代替后端共识校验。</p>
  </aside>
  <button class="mobile-inspect-trigger" :disabled="!block" @click="open">
    <AppIcon name="cube" /><span>{{ indexLabel }}</span
    ><AppIcon name="arrow" />
  </button>
  <dialog
    ref="mobileDialog"
    class="mobile-inspector"
    aria-labelledby="mobile-inspector-title"
    @close="dialogOpen = false"
    @click="
      (event) => {
        if (event.target === dialog) close()
      }
    "
  >
    <header class="mobile-inspector-heading">
      <h2 id="mobile-inspector-title">区块检查器</h2>
      <button class="icon-button" aria-label="关闭区块详情" @click="close">
        <AppIcon name="close" />
      </button>
    </header>
    <BlockDetails
      v-if="block && dialogOpen"
      :block="block"
      :previous="previous"
      :next="next"
      @select="emit('select', $event)"
      @locate="locateInChain"
    />
  </dialog>
</template>

<style scoped>
.inspector {
  min-width: 0;
  background: var(--white);
  border-radius: 14px;
  padding: 24px;
  align-self: start;
  margin-top: 32px;
  box-shadow: 0 16px 42px -24px #172d4630;
}
.inspector-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 17px;
  border-bottom: 1px solid var(--line);
}
.inspector-heading h2,
.mobile-inspector-heading h2 {
  font-size: 13px;
  margin: 0;
  font-weight: 500;
}
.inspector-heading > .app-icon {
  width: 17px;
  height: 17px;
  color: var(--muted);
}
.inspector-empty {
  min-height: 480px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 10px;
}
.inspector-empty > .app-icon {
  width: 34px;
  height: 34px;
  color: var(--muted);
}
.inspector-empty p {
  font-size: 14px;
  line-height: 1.9;
  margin: 12px 0;
}
.inspector-empty span {
  font-size: 12px;
  line-height: 1.9;
  color: var(--muted);
}
.inspector-note {
  margin: 20px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.9;
}
.inspect-enter-active {
  transition:
    opacity 180ms var(--ease-out),
    transform 180ms var(--ease-out);
}
.inspect-leave-active {
  transition: opacity 100ms var(--ease-out);
}
.inspect-enter-from {
  opacity: 0;
  transform: translateX(6px);
}
.inspect-leave-to {
  opacity: 0;
}
.mobile-inspect-trigger {
  display: none;
}
.mobile-inspector {
  border: 0;
}
.mobile-inspector-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: -24px;
  background: var(--white);
  z-index: 1;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
@media (max-width: 767px) {
  .inspector {
    display: none;
  }
  .mobile-inspect-trigger {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 0;
    background: var(--white);
    border-radius: 10px;
    padding: 17px 18px;
    margin-top: 24px;
    color: var(--ink);
    width: 100%;
    font-size: 13px;
    box-shadow: 0 12px 24px -20px #172d4640;
  }
  .mobile-inspect-trigger > span {
    flex: 1;
    text-align: left;
  }
  .mobile-inspector {
    position: fixed;
    inset: auto 0 0;
    margin: 0;
    padding: 20px 24px max(24px, env(safe-area-inset-bottom));
    width: 100%;
    max-width: 100%;
    max-height: 84dvh;
    border-radius: 20px 20px 0 0;
    color: var(--ink);
    background: var(--white);
    overscroll-behavior: contain;
  }
  .mobile-inspector[open] {
    animation: drawer-in 260ms var(--ease-drawer);
  }
  .mobile-inspector::backdrop {
    background: #172d465c;
  }
  .mobile-inspector-heading {
    top: -20px;
  }
  @keyframes drawer-in {
    from {
      transform: translateY(20%);
      opacity: 0.5;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .inspect-enter-active,
  .inspect-leave-active {
    transition: none;
  }
  .mobile-inspector[open] {
    animation: none;
  }
}
</style>
