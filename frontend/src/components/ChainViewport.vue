<script setup lang="ts">
import { computed, nextTick, onScopeDispose, shallowRef, toRef, useTemplateRef, watch } from 'vue'
import type { BlockRecord } from '../types'
import { chainLinks, findBlock } from '../lib/chain'
import { blockPosition, useChainCamera } from '../composables/useChainCamera'
import AppIcon from './AppIcon.vue'
import ChainBlock from './ChainBlock.vue'

const props = defineProps<{
  nodeId: string
  blocks: BlockRecord[]
  selectedKey: string | null
  appendedKeys: string[]
  revision: number
  change: string
  loading: boolean
  error: string | null
}>()
const emit = defineEmits<{ select: [key: string]; retry: [] }>()
const canvas = useTemplateRef<HTMLElement>('canvas')
const count = computed(() => props.blocks.length)
const {
  camera,
  worldStyle,
  visibleRange,
  dragging,
  moving,
  locate,
  fit,
  zoomBy,
  pointerDown,
  pointerMove,
  pointerUp,
  consumeClick,
} = useChainCamera(canvas, toRef(props, 'nodeId'), count)
const query = shallowRef('')
const searchError = shallowRef('')
const newKeys = shallowRef<string[]>([])
const announcement = shallowRef('')
const instant = shallowRef(false)
const replacing = shallowRef(false)
let animationTimer: ReturnType<typeof setTimeout> | undefined
let instantTimer: ReturnType<typeof setTimeout> | undefined
const selectedPosition = computed(() =>
  props.blocks.findIndex((block) => block.key === props.selectedKey),
)
const visibleBlocks = computed(() =>
  props.blocks
    .slice(visibleRange.value.first, visibleRange.value.last + 1)
    .map((block, i) => ({
      block,
      position: i + visibleRange.value.first,
      point: blockPosition(i + visibleRange.value.first),
    })),
)
const allLinks = computed(() => chainLinks(props.blocks))
const links = computed(() =>
  allLinks.value
    .filter((link) => link.to >= visibleRange.value.first && link.from <= visibleRange.value.last)
    .map((link) => {
      const from = blockPosition(link.from)
      const to = blockPosition(link.to)
      return {
        ...link,
        x1: from.x + 96,
        y1: from.y + 96,
        x2: to.x + 96,
        y2: to.y + 96,
        added: newKeys.value.includes(props.blocks[link.to]!.key),
      }
    }),
)
const brokenCount = computed(() => Math.max(0, props.blocks.length - 1 - allLinks.value.length))
const viewLabel = computed(() =>
  visibleBlocks.value.length
    ? `视野 #${visibleBlocks.value[0]!.block.index ?? '?'} 至 #${visibleBlocks.value.at(-1)!.block.index ?? '?'}`
    : '当前视野为空',
)

function select(key: string, keyboard = false, center = false) {
  if (consumeClick()) return
  if (keyboard) {
    instant.value = true
    clearTimeout(instantTimer)
    instantTimer = setTimeout(() => {
      instant.value = false
    }, 280)
  }
  emit('select', key)
  if (center)
    locate(
      props.blocks.findIndex((block) => block.key === key),
      !keyboard,
    )
}

function locateSelected(event?: Event) {
  if (selectedPosition.value >= 0) locate(selectedPosition.value, !(event instanceof KeyboardEvent))
}
function latest() {
  announcement.value = ''
  const block = props.blocks.at(-1)
  if (block) select(block.key, false, true)
}
function search(event: Event) {
  const block = findBlock(props.blocks, query.value)
  if (!block) {
    searchError.value = '未找到该高度或完整 Hash'
    return
  }
  searchError.value = ''
  select(block.key, event instanceof SubmitEvent && event.submitter === null, true)
}
function navigate(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  const target = event.target as HTMLElement
  if (target.closest('input') || (target.closest('button') && !target.closest('.chain-block')))
    return
  const position = selectedPosition.value < 0 ? count.value - 1 : selectedPosition.value
  let next = position
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
    next = Math.min(count.value - 1, position + 1)
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, position - 1)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count.value - 1
  else if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomBy(0.1, false)
    return
  } else if (event.key === '-') {
    event.preventDefault()
    zoomBy(-0.1, false)
    return
  } else if (event.key !== 'Enter') return
  event.preventDefault()
  const block = props.blocks[next]
  if (block) {
    select(block.key, true, true)
    if (target.closest('.chain-block'))
      void nextTick(() =>
        canvas.value
          ?.querySelector<HTMLButtonElement>(`[data-block-key="${CSS.escape(block.key)}"]`)
          ?.focus(),
      )
  }
}
function scrub(event: Event) {
  const position = Number((event.target as HTMLInputElement).value)
  const block = props.blocks[position]
  if (block) select(block.key, true, true)
}

watch(
  () => [props.nodeId, props.revision] as const,
  async ([id], previous) => {
    clearTimeout(animationTimer)
    newKeys.value = []
    replacing.value = false
    if (previous?.[0] !== id) {
      announcement.value = ''
      return
    }
    if (props.change === 'append') {
      newKeys.value = props.appendedKeys
      announcement.value = `收到 ${props.appendedKeys.length} 个新区块`
      await nextTick()
      animationTimer = setTimeout(() => {
        newKeys.value = []
      }, 650)
    } else if (props.change === 'replace') {
      announcement.value = '链快照已变化，请重新检查关联'
      await nextTick()
      replacing.value = true
      animationTimer = setTimeout(() => {
        replacing.value = false
      }, 240)
    }
  },
)
onScopeDispose(() => {
  clearTimeout(animationTimer)
  clearTimeout(instantTimer)
})
defineExpose({ locateSelected })
</script>

<template>
  <section class="chain-viewport" aria-label="交互式区块链">
    <div class="viewport-heading">
      <div>
        <h2 class="viewport-title">链的每一步，都有来处。</h2>
        <p class="viewport-description">选择区块，沿哈希引用追溯。</p>
      </div>
      <span v-if="count" class="height-readout"
        ><span>链高</span><strong>{{ blocks.at(-1)?.index ?? '未知' }}</strong
        ><span>{{ count }} 个区块</span></span
      >
    </div>
    <div class="viewport-toolbar">
      <form class="chain-search" @submit.prevent="search">
        <AppIcon name="search" /><input
          v-model="query"
          aria-label="定位高度或完整 Hash"
          placeholder="高度或完整 Hash"
          spellcheck="false"
        /><button type="submit" aria-label="定位区块"><AppIcon name="arrow" /></button>
      </form>
      <button class="button text-button latest-button" :disabled="!count" @click="latest">
        定位最新<AppIcon name="target" />
      </button>
    </div>
    <p v-if="searchError" class="search-error" role="alert">{{ searchError }}</p>
    <div
      ref="canvas"
      class="chain-canvas"
      :class="{ dragging, moving, instant }"
      tabindex="0"
      role="group"
      aria-label="区块链画布。拖动平移，方向键选择区块，Home 和 End 跳转首尾，加减键缩放。"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="pointerUp"
      @lostpointercapture="pointerUp"
      @keydown="navigate"
    >
      <div
        v-if="count"
        :key="nodeId"
        class="chain-world"
        :class="{ replacing }"
        :style="worldStyle"
      >
        <svg class="connections" width="1" height="1" aria-hidden="true">
          <g
            v-for="link in links"
            :key="link.key"
            class="chain-connection"
            :class="{ added: link.added }"
          >
            <line class="connection-base" :x1="link.x1" :y1="link.y1" :x2="link.x2" :y2="link.y2" />
            <line
              v-if="link.added"
              class="connection-trace"
              :x1="link.x1"
              :y1="link.y1"
              :x2="link.x2"
              :y2="link.y2"
            />
            <circle
              class="connection-marker"
              :cx="(link.x1 + link.x2) / 2"
              :cy="(link.y1 + link.y2) / 2"
              r="3"
            />
          </g>
        </svg>
        <ChainBlock
          v-for="{ block, position, point } in visibleBlocks"
          :key="block.key"
          :block="block"
          :selected="block.key === selectedKey"
          :latest="position === count - 1"
          :added="newKeys.includes(block.key)"
          :style="{ left: `${point.x}px`, top: `${point.y}px` }"
          @select="select(block.key)"
          @keydown.enter.prevent="select(block.key, true)"
          @keydown.space.prevent="select(block.key, true)"
        />
      </div>
      <div v-else class="canvas-empty">
        <svg
          class="empty-object"
          width="150"
          height="132"
          viewBox="0 0 150 132"
          fill="none"
          aria-hidden="true"
        >
          <path d="m75 10 60 35v52l-60 25-60-25V45l60-35Z" stroke="currentColor" />
          <path
            d="m15 45 60 28 60-28M75 73v49m0-86 30 15-30 15-30-15 30-15Z"
            stroke="currentColor"
          />
          <path d="M75 1v12M1 45h12m124 0h12M75 120v12" stroke="currentColor" />
        </svg>
        <h3>
          {{
            loading
              ? '正在读取链快照'
              : error
                ? '暂时无法读取区块链'
                : nodeId
                  ? '节点尚未返回区块'
                : '等待后端提供节点'
          }}
        </h3>
        <p>
          {{
            loading
              ? '正在向当前节点请求区块数据。'
              : error
                ? '请检查节点服务，或重新发起请求。'
                : nodeId
                  ? '当前 /blocks 返回空数组，刷新后再次检查。'
                : '请启动后端目录服务，并在后端配置观测节点。'
          }}
        </p>
        <button v-if="nodeId && !loading" class="button secondary" @click="emit('retry')">
          <AppIcon name="refresh" />重新读取
        </button>
      </div>
      <div v-if="count" class="canvas-coordinate" aria-hidden="true">
        <span class="coordinate-mark" />{{ viewLabel }}
      </div>
      <div v-if="count" class="canvas-controls">
        <button
          class="icon-button"
          aria-label="缩小"
          :disabled="camera.zoom <= 0.4"
          @click="zoomBy(-0.1)"
        >
          <AppIcon name="minus" /></button
        ><output class="zoom-value">{{ Math.round(camera.zoom * 100) }}%</output
        ><button
          class="icon-button"
          aria-label="放大"
          :disabled="camera.zoom >= 1.8"
          @click="zoomBy(0.1)"
        >
          <AppIcon name="plus" /></button
        ><span class="control-divider" /><button
          class="icon-button"
          aria-label="适应当前区段"
          title="适应当前区段"
          @click="fit(selectedPosition)"
        >
          <AppIcon name="fit" />
        </button>
      </div>
    </div>
    <div class="viewport-footer">
      <span class="chain-legend"
        ><span class="legend-line" />{{
          brokenCount ? `${brokenCount} 处引用无法关联` : '连线表示前块哈希引用'
        }}</span
      ><span class="drag-hint">拖动平移 · 方向键探索</span>
    </div>
    <div v-if="count > 1" class="height-navigator">
      <span>#{{ blocks[0]?.index ?? '?' }}</span
      ><input
        type="range"
        :min="0"
        :max="count - 1"
        :value="Math.max(0, selectedPosition)"
        aria-label="按区块位置探索"
        :aria-valuetext="`区块 #${blocks[Math.max(0, selectedPosition)]?.index ?? '未知'}`"
        @input="scrub"
      /><span>#{{ blocks.at(-1)?.index ?? '?' }}</span>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
    <button v-if="announcement" class="new-block-notice" @click="latest">
      {{ announcement }}<AppIcon name="arrow" />
    </button>
  </section>
</template>

<style scoped>
.chain-viewport {
  position: relative;
  min-width: 0;
  padding: 34px 0 0;
}
.viewport-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-right: 28px;
  gap: 20px;
}
.viewport-title {
  font-size: clamp(18px, 1.8vw, 24px);
  font-weight: 500;
  margin: 0 0 9px;
  letter-spacing: -0.03em;
}
.viewport-description {
  color: var(--muted);
  font-size: 12px;
  margin: 0;
}
.height-readout {
  display: grid;
  grid-template-columns: auto auto;
  align-items: baseline;
  gap: 2px 10px;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.height-readout strong {
  grid-row: span 2;
  grid-column: 2;
  font: 400 48px/1 var(--display);
  color: var(--ink);
  letter-spacing: -0.04em;
}
.viewport-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 0 0;
  gap: 16px;
}
.chain-search {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--line-strong);
  width: 260px;
  max-width: 65%;
}
.chain-search > .app-icon {
  width: 15px;
  height: 15px;
  color: var(--muted);
}
.chain-search input {
  width: 100%;
  min-width: 0;
  font: inherit;
  font-size: 11px;
  border: 0;
  outline: 0;
  padding: 12px 0;
  background: transparent;
  color: var(--ink);
}
.chain-search:focus-within {
  border-color: var(--blue);
}
.chain-search button {
  background: transparent;
  color: var(--ink);
  border: 0;
  min-width: 34px;
  min-height: 36px;
}
.latest-button {
  font-size: 11px;
  min-height: 36px;
}
.latest-button .app-icon {
  width: 16px;
  height: 16px;
}
.search-error {
  margin: 10px 0 0;
  color: var(--error);
  font-size: 12px;
}
.chain-canvas {
  position: relative;
  height: 460px;
  overflow: hidden;
  isolation: isolate;
  cursor: grab;
  touch-action: pan-y;
  background-image: radial-gradient(circle, #91a3b83b 0.8px, transparent 0.8px);
  background-size: 24px 24px;
  border-radius: 12px;
  margin-top: 12px;
}
.chain-canvas.dragging {
  cursor: grabbing;
  touch-action: none;
}
.chain-canvas:focus-visible {
  outline-offset: -3px;
}
.chain-world {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
}
.chain-world {
  animation: world-in 200ms var(--ease-out);
}
.chain-world.replacing {
  animation: snapshot-change 220ms var(--ease-out);
}
@keyframes world-in {
  from {
    opacity: 0.35;
  }
  to {
    opacity: 1;
  }
}
@keyframes snapshot-change {
  from {
    opacity: 0.5;
  }
  to {
    opacity: 1;
  }
}
.moving .chain-world {
  transition: transform 240ms var(--ease-out);
}
.connections {
  position: absolute;
  overflow: visible;
  pointer-events: none;
}
.connection-base {
  stroke: #8a9fb9;
  stroke-width: 1;
}
.connection-marker {
  fill: var(--bg);
  stroke: #8a9fb9;
  stroke-width: 1;
}
.connection-trace {
  stroke: var(--blue);
  stroke-width: 3;
  stroke-dasharray: 258;
  stroke-dashoffset: 258;
  animation: connect-block 480ms var(--ease-out) forwards;
}
@keyframes connect-block {
  to {
    stroke-dashoffset: 0;
  }
}
.canvas-coordinate {
  position: absolute;
  left: 18px;
  bottom: 22px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  pointer-events: none;
}
.coordinate-mark {
  width: 9px;
  height: 9px;
  border-bottom: 1px solid var(--muted);
  border-left: 1px solid var(--muted);
}
.canvas-controls {
  display: flex;
  gap: 1px;
  align-items: center;
  position: absolute;
  right: 18px;
  bottom: 14px;
  background: var(--white);
  padding: 4px;
  border-radius: 8px;
  cursor: default;
}
.zoom-value {
  min-width: 40px;
  text-align: center;
  font: 11px/1 var(--display);
  font-variant-numeric: tabular-nums;
}
.control-divider {
  width: 1px;
  height: 17px;
  background: var(--line);
  margin: 0 5px;
}
.canvas-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  height: 100%;
  padding: 20px;
  text-align: center;
}
.empty-object {
  color: #91a6bf;
  margin-bottom: 16px;
}
.canvas-empty h3 {
  font-size: 19px;
  font-weight: 500;
  margin: 12px 0;
}
.canvas-empty p {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.8;
  max-width: 38ch;
  margin: 0 0 18px;
}
.viewport-footer {
  padding: 10px 24px 0 0;
  display: flex;
  justify-content: space-between;
  gap: 15px;
  font-size: 11px;
  color: var(--muted);
}
.chain-legend {
  display: flex;
  align-items: center;
  gap: 9px;
}
.legend-line {
  width: 25px;
  height: 1px;
  background: #8a9fb9;
}
.height-navigator {
  display: flex;
  align-items: center;
  gap: 15px;
  margin: 26px 28px 0 0;
  font: 11px/1 var(--display);
}
.height-navigator input {
  flex: 1;
  min-width: 0;
  accent-color: var(--blue);
  height: 30px;
  cursor: pointer;
}
.new-block-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: var(--blue);
  color: white;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 12px;
  margin-top: 18px;
}
.instant :deep(*) {
  transition-duration: 0ms !important;
  animation-duration: 0ms !important;
}
@media (min-width: 1500px) {
  .chain-canvas {
    height: 510px;
  }
}
@media (max-width: 1050px) {
  .viewport-heading,
  .viewport-toolbar,
  .viewport-footer {
    padding-right: 0;
  }
  .height-navigator {
    margin-right: 0;
  }
  .height-readout strong {
    font-size: 38px;
  }
}
@media (max-width: 767px) {
  .chain-viewport {
    padding-top: 26px;
  }
  .chain-canvas {
    height: 370px;
  }
  .canvas-coordinate {
    bottom: 72px;
    left: 12px;
  }
  .canvas-controls {
    bottom: 14px;
    right: 12px;
  }
  .drag-hint {
    display: none;
  }
  .chain-search input {
    font-size: 12px;
  }
  .chain-search button {
    min-width: 44px;
    min-height: 44px;
  }
  .latest-button {
    padding-inline: 0;
    min-height: 44px;
  }
  .viewport-toolbar {
    gap: 10px;
  }
  .height-navigator {
    margin-top: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .moving .chain-world {
    transition: none;
  }
  .connection-trace {
    animation: none;
    stroke-dashoffset: 0;
  }
}
</style>
