<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { ObservedNode } from '../types'
import { sampleTime } from '../lib/chain'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ nodes: ObservedNode[]; activeNode: ObservedNode | null; directoryPending: boolean }>()
const emit = defineEmits<{ select: [id: string] }>()
const expanded = shallowRef(false)
const peers = computed(() => props.activeNode?.peers)

function nodeLabel(node: ObservedNode) {
  return node.info.data?.p2pPort
    ? `节点 ${node.info.data.p2pPort}`
    : node.info.data
      ? 'P2P 未开启'
      : new URL(node.baseUrl).host
}
function nodeState(node: ObservedNode) {
  return node.info.error
    ? 'API 无法访问'
    : node.info.data
      ? 'API 可访问'
      : node.info.pending
        ? '连接中'
        : '等待采样'
}
</script>

<template>
  <section class="node-observer" aria-label="节点观察">
    <div class="node-rail">
      <div class="rail-label">
        <AppIcon name="network" /><span>观测节点</span
        ><span class="node-count">{{ nodes.length.toString().padStart(2, '0') }}</span>
      </div>
      <div class="node-tabs" aria-label="选择观测节点">
        <button
          v-for="node in nodes"
          :key="node.id"
          class="node-tab"
          :class="{ selected: activeNode?.id === node.id }"
          :aria-pressed="activeNode?.id === node.id"
          :title="node.baseUrl"
          @click="emit('select', node.id)"
        >
          <span
            class="status-dot"
            :class="{ online: node.info.data && !node.info.error, failed: node.info.error }"
          />
          <span>{{ nodeLabel(node) }}</span>
          <span class="node-tab-count">{{
            node.info.error
              ? '不可用'
              : node.blocks.data
                ? `${node.blocks.data.length} 区块`
                : node.info.data
                  ? `${node.info.data.blockCount} 区块`
                  : '待连接'
          }}</span>
        </button>
      </div>
      <span class="directory-note">{{ directoryPending ? '正在读取后端目录…' : '节点由后端统一配置' }}</span>
    </div>
    <p v-if="!nodes.length" class="directory-empty">等待后端提供节点。请启动目录服务，并在后端使用 observe 配置其他 API 地址。</p>

    <template v-if="activeNode">
      <div class="node-summary">
        <span class="endpoint"
          ><span class="summary-label">当前 API</span>{{ activeNode.baseUrl }}</span
        >
        <button class="peer-toggle" :aria-expanded="expanded" @click="expanded = !expanded">
          <AppIcon name="network" />{{
            peers?.error
              ? '对等连接查询失败'
              : peers?.data
                ? `${peers.data.length} 个对等连接`
                : '查询对等连接…'
          }}<AppIcon :name="expanded ? 'minus' : 'plus'" />
        </button>
      </div>
      <div v-if="expanded" class="peer-panel">
        <div class="peer-panel-heading">
          <h2 class="peer-title">{{ nodeLabel(activeNode) }} 的对等连接</h2>
          <span class="muted">采样 {{ sampleTime(peers?.updatedAt ?? null) }}</span>
        </div>
        <p v-if="peers?.error" class="form-error" role="alert">
          {{ peers.error }}{{ peers.data ? '；以下为最后成功快照。' : '' }}
        </p>
        <ul v-if="peers?.data?.length" class="peer-list">
          <li v-for="peer in peers.data" :key="peer">
            <span class="status-dot" :class="{ online: !peers.error }" /><code>{{ peer }}</code
            ><span>{{ peers.error ? '状态未知' : '节点报告已连接' }}</span>
          </li>
        </ul>
        <p v-else-if="peers?.data && !peers.error" class="muted">
          暂无对等连接。可在该节点的命令行使用 connect 连接其他节点。
        </p>
        <p class="peer-note">这里只显示当前节点报告的连接，不代表全网拓扑。</p>
        <div class="peer-actions">
          <span class="muted"
            >{{ nodeState(activeNode)
            }}<template v-if="activeNode.info.data?.p2pPort === null"
              >；该节点尚未开启 P2P 监听</template
            ></span
          >
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.directory-note { margin-left: auto; font-size: 12px; color: var(--muted); }
.directory-empty { font-size: 12px; color: var(--muted); line-height: 1.8; margin: 0 0 18px; }

.node-observer {
  position: relative;
  z-index: 3;
  border-bottom: 1px solid var(--line);
}
.node-rail {
  display: flex;
  align-items: center;
  min-height: 70px;
  gap: 28px;
}
.rail-label {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  font-size: 13px;
}
.node-count {
  font-family: var(--display);
  color: var(--muted);
  margin-left: 5px;
  font-variant-numeric: tabular-nums;
}
.node-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
  padding: 8px 2px;
}
.node-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  padding: 13px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  transition:
    background-color 140ms ease,
    color 140ms ease,
    transform 120ms var(--ease-out);
}
.node-tab.selected {
  color: var(--ink);
  background: var(--white);
  border-color: var(--line);
}
.node-tab-count {
  color: var(--muted);
  font-size: 11px;
}
.form-error { margin: 10px 0 0; font-size: 12px; line-height: 1.7; }
.form-error {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.7;
}
.form-help {
  color: var(--muted);
}
.form-error {
  color: var(--error);
}
.node-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 16px;
  gap: 20px;
  font-size: 11px;
}
.endpoint {
  font-size: 12px;
  overflow-wrap: anywhere;
  color: var(--muted);
}
.summary-label {
  margin-right: 12px;
  color: var(--ink);
}
.peer-toggle {
  border: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: var(--ink);
  font-size: 11px;
  flex-shrink: 0;
  min-height: 32px;
}
.peer-toggle .app-icon {
  width: 14px;
  height: 14px;
}
.peer-panel {
  padding: 20px 24px;
  background: var(--white);
  border-radius: 12px;
  margin-bottom: 20px;
}
.peer-panel-heading,
.peer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.peer-title {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}
.peer-panel .muted {
  font-size: 12px;
}
.peer-list {
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
}
.peer-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}
.peer-list li > span:last-child {
  color: var(--muted);
}
.peer-note {
  font-size: 12px;
  color: var(--muted);
  margin: 16px 0;
}
.peer-actions {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
@media (hover: hover) and (pointer: fine) {
  .node-tab:hover {
    color: var(--blue);
    background: var(--white);
  }
}
@media (max-width: 767px) {
  .node-rail {
    gap: 12px;
    flex-wrap: wrap;
    padding: 14px 0;
  }
  .rail-label {
    flex: 1;
  }
  .node-tabs {
    order: 3;
    flex-basis: 100%;
  }
  .node-tab {
    min-height: 44px;
  }
  .node-summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
  .peer-panel {
    padding: 18px;
  }
  .peer-panel-heading,
  .peer-actions {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .peer-toggle {
    min-height: 44px;
  }
}
</style>
