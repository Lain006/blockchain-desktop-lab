<script setup lang="ts">
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import type { BlockRecord } from '../types'
import { formatTimestamp } from '../lib/chain'
import AppIcon from './AppIcon.vue'
const props = defineProps<{
  block: BlockRecord
  previous: BlockRecord | null
  next: BlockRecord | null
}>()
defineEmits<{ select: [key: string]; locate: [] }>()
const copied = shallowRef<string | null>(null)
const copyError = shallowRef(false)
const expandedData = shallowRef(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
const timestamp = computed(() => formatTimestamp(props.block.timestamp))
const dataLength = computed(() => props.block.data?.length ?? 0)
async function copy(value: string | null, field: string) {
  if (value === null) return
  const key = props.block.key
  copyError.value = false
  try {
    await navigator.clipboard.writeText(value)
    if (props.block.key !== key) return
    copied.value = field
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied.value = null
    }, 1800)
  } catch {
    if (props.block.key === key) copyError.value = true
  }
}
watch(
  () => props.block.key,
  () => {
    copied.value = null
    copyError.value = false
    expandedData.value = false
    clearTimeout(copyTimer)
  },
)
onScopeDispose(() => {
  clearTimeout(copyTimer)
})
</script>

<template>
  <div class="block-details">
    <div class="detail-identity">
      <div>
        <span class="detail-kind">{{ block.index === 0 ? '创世区块' : '所选区块' }}</span>
        <h3 class="detail-index">#{{ block.index ?? '?' }}</h3>
      </div>
      <button
        class="icon-button locate-button"
        aria-label="在链中定位当前区块"
        title="在链中定位"
        @click="$emit('locate')"
      >
        <AppIcon name="target" />
      </button>
    </div>
    <div v-if="block.issues.length" class="field-warning" role="status">
      <strong>字段需要检查</strong>
      <ul>
        <li v-for="issue in block.issues" :key="issue">{{ issue }}</li>
      </ul>
    </div>
    <div class="detail-field">
      <div class="field-heading">
        <span>Hash</span
        ><button
          class="copy-button"
          :disabled="block.hash === null"
          :aria-label="copied === 'hash' ? 'Hash 已复制' : '复制 Hash'"
          @click="copy(block.hash, 'hash')"
        >
          <AppIcon :name="copied === 'hash' ? 'check' : 'copy'" /><span>{{
            copied === 'hash' ? '已复制' : '复制'
          }}</span>
        </button>
      </div>
      <code class="hash-value">{{ block.hash ?? '字段缺失' }}</code>
    </div>
    <div class="detail-field">
      <div class="field-heading">
        <span>Prev Hash</span
        ><button
          class="copy-button"
          :disabled="block.previousHash === null"
          :aria-label="copied === 'previous' ? 'Prev Hash 已复制' : '复制 Prev Hash'"
          @click="copy(block.previousHash, 'previous')"
        >
          <AppIcon :name="copied === 'previous' ? 'check' : 'copy'" /><span>{{
            copied === 'previous' ? '已复制' : '复制'
          }}</span>
        </button>
      </div>
      <code class="hash-value previous-hash">{{ block.previousHash ?? '字段缺失' }}</code
      ><span v-if="block.index === 0" class="field-note">创世区块没有前驱。</span
      ><button v-else-if="previous" class="relation-link" @click="$emit('select', previous.key)">
        查看前块 #{{ previous.index }}<AppIcon name="arrow" /></button
      ><span v-else class="field-note warning-note">当前快照中无法关联前块。</span>
    </div>
    <div class="detail-field data-field">
      <div class="field-heading">
        <span>Data</span
        ><span class="data-length">{{ block.data === null ? '缺失' : `${dataLength} 字符` }}</span>
      </div>
      <pre class="data-value" :class="{ expanded: expandedData }">{{
        block.data === null ? '字段缺失' : block.data === '' ? '（空字符串）' : block.data
      }}</pre>
      <button v-if="dataLength > 240" class="relation-link" @click="expandedData = !expandedData">
        {{ expandedData ? '收起数据' : '展开完整数据' }}
      </button>
    </div>
    <div class="detail-field compact-field">
      <span class="field-name">Nonce</span
      ><span class="nonce-value">{{ block.nonce ?? '字段缺失' }}</span>
    </div>
    <div class="detail-field time-field">
      <span class="field-name">时间戳</span><time class="timestamp-value">{{ timestamp }}</time
      ><code class="raw-timestamp"
        >{{ block.timestamp ?? '字段缺失'
        }}<span v-if="typeof block.timestamp === 'number'"> ms</span></code
      >
    </div>
    <p v-if="copyError" class="copy-error" role="alert">复制失败，请选中完整字段后手动复制。</p>
    <p class="sr-only" role="status">{{ copied ? '字段已复制' : '' }}</p>
    <nav class="block-navigation" aria-label="区块关联导航">
      <button
        class="relation-button"
        :disabled="!previous"
        @click="previous && $emit('select', previous.key)"
      >
        <AppIcon name="left" /><span
          >前一区块<small>{{ previous ? `#${previous.index}` : '无前驱' }}</small></span
        ></button
      ><button
        class="relation-button next-relation"
        :disabled="!next"
        @click="next && $emit('select', next.key)"
      >
        <span
          >后一区块<small>{{ next ? `#${next.index}` : '无后继' }}</small></span
        ><AppIcon name="right" />
      </button>
    </nav>
  </div>
</template>

<style scoped>
.detail-identity {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 27px 0 23px;
}
.detail-kind {
  color: var(--muted);
  font-size: 11px;
}
.detail-index {
  font: 400 56px/1.1 var(--display);
  letter-spacing: -0.04em;
  margin: 9px 0 0;
}
.locate-button {
  background: var(--bg);
}
.detail-field {
  border-top: 1px solid var(--line);
  padding: 16px 0;
}
.field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 11px;
  margin-bottom: 10px;
  min-height: 24px;
}
.copy-button {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: 4px 0 4px 8px;
  font-size: 11px;
  color: var(--blue);
}
.copy-button .app-icon {
  width: 13px;
  height: 13px;
}
.hash-value {
  display: block;
  font: 11px/1.9 var(--mono);
  overflow-wrap: anywhere;
  user-select: text;
  color: var(--ink);
}
.previous-hash {
  color: var(--muted);
}
.field-note {
  color: var(--muted);
  font-size: 12px;
  display: block;
  margin-top: 9px;
}
.warning-note {
  color: var(--amber);
}
.relation-link {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  padding: 7px 0;
  margin-top: 4px;
  background: transparent;
  color: var(--blue);
  font-size: 11px;
  min-height: 30px;
}
.relation-link .app-icon {
  width: 13px;
  height: 13px;
}
.data-length {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}
.data-value {
  font: 12px/1.8 var(--sans);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  max-height: 130px;
  overflow-y: auto;
  margin: 0;
  padding: 12px 14px;
  background: var(--bg);
  border-radius: 6px;
  user-select: text;
}
.data-value.expanded {
  max-height: none;
}
.compact-field {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 15px;
}
.field-name {
  font-size: 11px;
  color: var(--muted);
}
.nonce-value {
  font: 400 20px/1.2 var(--display);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.time-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.timestamp-value {
  font-size: 11px;
  overflow-wrap: anywhere;
}
.raw-timestamp {
  font: 10px/1.6 var(--mono);
  color: var(--muted);
  overflow-wrap: anywhere;
}
.block-navigation {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--line);
  padding-top: 17px;
  gap: 10px;
}
.relation-button {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 11px/1.4 var(--sans);
  color: var(--ink);
  text-align: left;
  border: 0;
  background: transparent;
  padding: 6px 0;
}
.relation-button small {
  display: block;
  margin-top: 5px;
  color: var(--muted);
  font: 11px/1 var(--display);
}
.next-relation {
  text-align: right;
}
.field-warning {
  padding: 12px;
  border-radius: 6px;
  color: var(--error);
  background: var(--error-bg);
  font-size: 11px;
  line-height: 1.8;
  margin-bottom: 15px;
}
.field-warning ul {
  padding-left: 15px;
  margin: 5px 0 0;
}
.field-warning strong {
  font-weight: 500;
}
.copy-error {
  color: var(--error);
  font-size: 12px;
  line-height: 1.8;
}
@media (max-width: 767px) {
  .copy-button {
    min-height: 44px;
    min-width: 58px;
    justify-content: flex-end;
  }
  .relation-link {
    min-height: 44px;
  }
  .relation-button {
    min-height: 44px;
  }
  .hash-value {
    font-size: 12px;
  }
  .detail-identity {
    padding-top: 20px;
  }
}
</style>
