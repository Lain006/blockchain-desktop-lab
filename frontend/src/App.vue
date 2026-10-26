<script setup lang="ts">
import { computed, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import NodeObserver from './components/NodeObserver.vue'
import ChainViewport from './components/ChainViewport.vue'
import BlockInspector from './components/BlockInspector.vue'
import AppIcon from './components/AppIcon.vue'
import { useObservatory } from './composables/useObservatory'
import { chainLinks, sampleTime } from './lib/chain'
const {
  nodes,
  activeNode,
  autoRefresh,
  directory,
  storageWarning,
  selectNode,
  refresh,
  setAutoRefresh,
} = useObservatory()
const selectedKeys = shallowRef<Record<string, string>>({})
const openRequest = shallowRef(0)
const viewport = useTemplateRef<InstanceType<typeof ChainViewport>>('viewport')
const blocks = computed(() => activeNode.value?.blocks.data ?? [])
const selectedKey = computed(() =>
  activeNode.value ? (selectedKeys.value[activeNode.value.id] ?? null) : null,
)
const block = computed(() => blocks.value.find((item) => item.key === selectedKey.value) ?? null)
const links = computed(() => chainLinks(blocks.value))
const position = computed(() => blocks.value.findIndex((item) => item.key === selectedKey.value))
const previous = computed(() => {
  const link = links.value.find((item) => item.to === position.value)
  return link ? (blocks.value[link.from] ?? null) : null
})
const next = computed(() => {
  const link = links.value.find((item) => item.from === position.value)
  return link ? (blocks.value[link.to] ?? null) : null
})
const pending = computed(() =>
  directory.pending || Boolean(
    activeNode.value &&
      (activeNode.value.info.pending ||
        activeNode.value.blocks.pending ||
        activeNode.value.peers.pending),
  ),
)
const apiStatus = computed(() => {
  const node = activeNode.value
  if (!node) return directory.pending ? '正在读取后端目录' : '等待后端节点'
  if (!node.info.updatedAt && node.info.pending) return '正在连接 API'
  if (node.info.error) return 'API 查询失败'
  return node.info.data ? 'API 可访问' : '等待采样'
})
const errors = computed(() => {
  const node = activeNode.value
  const resources = [
    { label: '后端节点目录', resource: directory },
    ...(node ? [{ label: '节点信息', resource: node.info }, { label: '区块链', resource: node.blocks }, { label: '对等连接', resource: node.peers }] : []),
  ]
  return resources.flatMap(({ label, resource }) =>
    resource.error
      ? [
          `${label}：${resource.error}${resource.updatedAt ? `；快照采样于 ${sampleTime(resource.updatedAt)}` : ''}`,
        ]
      : [],
  )
})
function selectBlock(key: string) {
  if (!activeNode.value) return
  selectedKeys.value = { ...selectedKeys.value, [activeNode.value.id]: key }
  openRequest.value++
}
watch(
  [() => activeNode.value?.id, blocks],
  () => {
    const node = activeNode.value
    if (!node) return
    const previousKey = selectedKeys.value[node.id]
    if (!blocks.value.some((item) => item.key === previousKey)) {
      const latest = blocks.value.at(-1)
      if (latest) selectedKeys.value = { ...selectedKeys.value, [node.id]: latest.key }
    }
  },
  { immediate: true },
)
const keyboardInput = () => {
  document.documentElement.dataset.input = 'keyboard'
}
const pointerInput = () => {
  document.documentElement.dataset.input = 'pointer'
}
onMounted(() => {
  document.addEventListener('keydown', keyboardInput, true)
  document.addEventListener('pointerdown', pointerInput, true)
})
onScopeDispose(() => {
  document.removeEventListener('keydown', keyboardInput, true)
  document.removeEventListener('pointerdown', pointerInput, true)
  delete document.documentElement.dataset.input
})
</script>

<template>
  <div class="observatory">
    <header class="masthead">
      <a class="brand" href="#main" aria-label="Blockchain Observatory，跳至观测区"
        ><svg
          class="brand-symbol"
          width="36"
          height="38"
          viewBox="0 0 36 38"
          fill="none"
          aria-hidden="true"
        >
          <path d="m18 2 15 8v18l-15 8-15-8V10l15-8Z" stroke="currentColor" stroke-width="1.4" />
          <path
            d="m3 10 15 9 15-9M18 19v17M10.5 6l15 9v9l-15 8"
            stroke="currentColor"
            stroke-width="1.4"
          /></svg
        ><span>Blockchain<br /><strong>Observatory</strong></span></a
      >
      <span class="masthead-note">区块链观测站</span
      ><a class="protocol-link" href="#observation-notes">关于观测<AppIcon name="external" /></a>
    </header>
    <main id="main">
      <section class="intro">
        <div class="intro-type">
          <h1>Every block.<br />A continuation.</h1>
          <p>每一个区块，都延续着上一个。</p>
        </div>
        <div class="observation-controls">
          <div class="connection-status" role="status">
            <span
              class="status-dot"
              :class="{
                online: activeNode?.info.data && !activeNode.info.error,
                failed: activeNode?.info.error,
              }"
            />{{ apiStatus }}
          </div>
          <div class="refresh-controls">
            <label class="auto-refresh"
              ><input
                type="checkbox"
                :checked="autoRefresh"
                @change="setAutoRefresh(($event.target as HTMLInputElement).checked)"
              /><span class="switch-track" aria-hidden="true"><span /></span>自动刷新<span
                class="refresh-interval"
                >2s</span
              ></label
            ><button
              class="button secondary refresh-button"
              :disabled="pending"
              @click="refresh"
            >
              <AppIcon name="refresh" />{{ pending ? '读取中' : '刷新链' }}
            </button>
          </div>
          <span class="last-sampled"
            >链快照 {{ sampleTime(activeNode?.blocks.updatedAt ?? null) }}</span
          >
        </div>
      </section>
      <NodeObserver
        :nodes="nodes"
        :active-node="activeNode"
        :directory-pending="directory.pending"
        @select="selectNode"
      />
      <div v-if="errors.length" class="request-errors" role="alert">
        <div>
          <p v-for="error in errors" :key="error">{{ error }}</p>
          <span v-if="activeNode?.blocks.data">保留最后成功数据；当前显示可能已过期。</span>
        </div>
        <button class="button secondary" :disabled="pending" @click="refresh">立即重试</button>
      </div>
      <p v-if="storageWarning" class="storage-warning" role="status">
        浏览器未允许保存偏好；节点仍由后端目录提供，当前观测可继续使用。
      </p>
      <div class="observation-workspace">
        <ChainViewport
          ref="viewport"
          :node-id="activeNode?.id ?? ''"
          :blocks="blocks"
          :selected-key="selectedKey"
          :appended-keys="activeNode?.appendedKeys ?? []"
          :revision="activeNode?.revision ?? 0"
          :change="activeNode?.change ?? 'initial'"
          :loading="activeNode?.blocks.pending ?? false"
          :error="activeNode?.blocks.error ?? null"
          @select="selectBlock"
          @retry="refresh"
        />
        <BlockInspector
          :block="block"
          :previous="previous"
          :next="next"
          :open-request="openRequest"
          :node-id="activeNode?.id ?? ''"
          @select="selectBlock"
          @locate="viewport?.locateSelected()"
        />
      </div>
    </main>
    <footer id="observation-notes" class="page-footer">
      <span>Blockchain Observatory</span>
      <p>
        从真实节点读取。区块链引用与 P2P 连接分别观测。<br
          class="mobile-break"
        />桌面实验会自动保存区块；手动 CLI 默认仅保存在内存中。
      </p>
      <span class="footer-protocol">SHA-256 / TCP P2P</span>
    </footer>
  </div>
</template>

<style scoped>
.observatory {
  max-width: 1680px;
  margin: 0 auto;
  padding: 0 56px;
}
.masthead {
  display: flex;
  align-items: center;
  padding: 22px 0;
  gap: 25px;
  border-bottom: 1px solid var(--line);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: var(--ink);
  font: 400 15px/1.15 var(--display);
  letter-spacing: -0.02em;
}
.brand strong {
  font-weight: 500;
}
.brand-symbol {
  flex: 0 0 auto;
}
.masthead-note {
  color: var(--muted);
  font-size: 11px;
  padding-left: 25px;
  border-left: 1px solid var(--line-strong);
}
.protocol-link {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 11px;
  text-decoration-thickness: 1px;
  text-underline-offset: 5px;
}
.protocol-link .app-icon {
  width: 13px;
  height: 13px;
}
.intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 30px;
  padding: 32px 0 28px;
  animation: intro-in 450ms var(--ease-out) both;
}
.intro h1 {
  margin: 0;
  font: 400 clamp(42px, 4vw, 58px) / 1.02 var(--display);
  letter-spacing: -0.04em;
}
.intro-type > p {
  margin: 20px 0 0;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.05em;
}
.observation-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 18px;
  padding-bottom: 2px;
}
.connection-status {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12px;
}
.refresh-controls {
  display: flex;
  align-items: center;
  gap: 24px;
}
.auto-refresh {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 11px;
  position: relative;
  min-height: 44px;
}
.auto-refresh input {
  position: absolute;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.switch-track {
  display: flex;
  width: 28px;
  height: 16px;
  align-items: center;
  border-radius: 10px;
  background: #a5b2c2;
  padding: 2px;
  pointer-events: none;
}
.switch-track > span {
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transform: translateX(0);
  transition: transform 160ms var(--ease-out);
}
.auto-refresh input:checked + .switch-track {
  background: var(--blue);
}
.auto-refresh input:checked + .switch-track > span {
  transform: translateX(12px);
}
.auto-refresh input:focus-visible + .switch-track {
  outline: 2px solid var(--blue);
  outline-offset: 4px;
}
.refresh-interval {
  color: var(--muted);
  font-family: var(--display);
}
.last-sampled {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.observation-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 32px;
  align-items: start;
  padding-bottom: 50px;
}
.request-errors {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin: 20px 0 0;
  padding: 16px 20px;
  background: var(--error-bg);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--error);
}
.request-errors p {
  margin: 0;
}
.request-errors span {
  font-size: 11px;
}
.storage-warning {
  font-size: 12px;
  color: var(--amber-text);
  line-height: 1.8;
}
.page-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  border-top: 1px solid var(--line);
  padding: 26px 0 30px;
  color: var(--muted);
  font-size: 11px;
}
.page-footer > span:first-child {
  font-family: var(--display);
  font-size: 12px;
  color: var(--ink);
}
.page-footer p {
  margin: 0;
  line-height: 1.9;
}
.footer-protocol {
  font-family: var(--display);
  font-size: 11px;
  white-space: nowrap;
}
.mobile-break {
  display: none;
}
@keyframes intro-in {
  from {
    transform: translateY(8px);
    opacity: 0.3;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@media (min-width: 1500px) {
  .observation-workspace {
    grid-template-columns: minmax(0, 1fr) 350px;
    gap: 45px;
  }
}
@media (max-width: 1100px) {
  .observatory {
    padding: 0 32px;
  }
  .observation-workspace {
    grid-template-columns: minmax(0, 1fr) 290px;
    gap: 24px;
  }
  .refresh-controls {
    gap: 16px;
  }
  .footer-protocol {
    display: none;
  }
}
@media (max-width: 767px) {
  .observatory {
    padding: 0 20px;
  }
  .masthead {
    padding: 21px 0;
  }
  .masthead-note {
    display: none;
  }
  .protocol-link {
    font-size: 11px;
  }
  .intro {
    flex-direction: column;
    align-items: stretch;
    padding: 32px 0 14px;
    gap: 26px;
  }
  .intro h1 {
    font-size: clamp(40px, 9.6vw, 64px);
  }
  .intro-type > p {
    margin-top: 16px;
    font-size: 11px;
  }
  .observation-controls {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    align-items: center;
  }
  .refresh-controls {
    grid-row: span 2;
    grid-column: 2;
    gap: 12px;
  }
  .auto-refresh {
    font-size: 11px;
  }
  .refresh-interval {
    display: none;
  }
  .refresh-button {
    padding: 10px;
    font-size: 11px;
  }
  .connection-status {
    font-size: 11px;
  }
  .last-sampled {
    font-size: 11px;
  }
  .observation-workspace {
    display: block;
    padding-bottom: 30px;
  }
  .page-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
    padding: 23px 0;
  }
  .mobile-break {
    display: block;
  }
  .page-footer p {
    font-size: 11px;
  }
  .request-errors {
    flex-direction: column;
    align-items: flex-start;
    padding: 15px;
  }
}
</style>
