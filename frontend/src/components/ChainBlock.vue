<script setup lang="ts">
import { computed } from 'vue'
import type { BlockRecord } from '../types'
import { shortHash } from '../lib/chain'

const props = defineProps<{
  block: BlockRecord
  selected: boolean
  latest: boolean
  added: boolean
}>()
defineEmits<{ select: [] }>()
const label = computed(
  () =>
    `区块 #${props.block.index ?? '未知'}${props.block.index === 0 ? '，创世块' : ''}${props.latest ? '，最新区块' : ''}${props.block.issues.length ? '，字段异常' : ''}`,
)
</script>

<template>
  <button
    class="chain-block"
    :class="{ selected, latest, added, invalid: block.issues.length }"
    :aria-label="label"
    :aria-pressed="selected"
    :data-block-key="block.key"
    @click="$emit('select')"
  >
    <span class="block-label"
      ><span class="block-index">#{{ block.index ?? '?' }}</span
      ><span class="block-kind">{{
        block.issues.length
          ? '字段异常'
          : block.index === 0
            ? '创世块'
            : latest
              ? '链尾区块'
              : '区块'
      }}</span></span
    >
    <svg class="block-object" width="192" height="130" viewBox="0 0 192 130" aria-hidden="true">
      <path class="block-shadow" d="m16 88 80-29 80 29-80 30Z" />
      <g class="block-layers">
        <path class="layer-edge" d="m10 68 86-34 86 34v12l-86 34-86-34Z" />
        <path class="layer-top" d="m10 68 86-34 86 34-86 34Z" />
        <path class="body-left" d="m10 46 86 34v21L10 67Z" />
        <path class="body-right" d="m96 80 86-34v21l-86 34Z" />
        <path class="body-top" d="m10 46 86-34 86 34-86 34Z" />
        <path class="plate-inset" d="m42 46 54-21 54 21-54 21Z" />
        <path class="plate-symbol" d="m78 46 18-7 18 7-18 7Zm18-7v14" />
        <path class="edge-highlight" d="m11 46 85 34 85-34M96 80v20" />
      </g>
      <circle class="block-pin" cx="165" cy="66" r="2" />
    </svg>
    <span class="block-hash">{{ shortHash(block.hash, 5) }}</span>
    <span v-if="selected" class="selected-caption">正在检查</span>
  </button>
</template>

<style scoped>
.chain-block {
  width: 192px;
  height: 210px;
  background: transparent;
  border: 0;
  padding: 0;
  position: absolute;
  color: var(--ink);
  text-align: left;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  border-radius: 12px;
}
.block-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 14px;
}
.block-index {
  font: 500 28px/1 var(--display);
  letter-spacing: -0.03em;
}
.block-kind {
  font-size: 11px;
  color: var(--muted);
}
.block-object {
  display: block;
  overflow: visible;
  margin-top: 8px;
}
.block-shadow {
  fill: #172d4610;
}
.layer-edge {
  fill: #c2cfdc;
}
.layer-top {
  fill: #e0e7ee;
  stroke: #b9c7d7;
  stroke-width: 0.7;
}
.body-left {
  fill: #d0dce8;
  stroke: #b4c3d4;
  stroke-width: 0.7;
}
.body-right {
  fill: #aebfd2;
  stroke: #9caec5;
  stroke-width: 0.7;
}
.body-top {
  fill: #fafcff;
  stroke: #aabed4;
  stroke-width: 1;
}
.plate-inset {
  fill: none;
  stroke: #b7c9dd;
  stroke-width: 0.8;
}
.plate-symbol {
  fill: none;
  stroke: #809ab8;
  stroke-width: 1;
}
.edge-highlight {
  fill: none;
  stroke: white;
  stroke-opacity: 0.8;
  stroke-width: 1;
}
.block-pin {
  fill: #6f8eab;
}
.block-layers {
  transition: transform 180ms var(--ease-out);
}
.block-hash {
  display: block;
  text-align: center;
  font: 11px/1.5 var(--mono);
  color: var(--ink);
  letter-spacing: 0.02em;
  margin-top: -4px;
}
.selected-caption {
  display: block;
  text-align: center;
  color: var(--blue);
  font-size: 11px;
  margin-top: 6px;
}
.selected .body-top {
  fill: var(--blue);
  stroke: #6485ca;
}
.selected .body-left {
  fill: #294d98;
  stroke: #345caa;
}
.selected .body-right {
  fill: #203f7c;
  stroke: #345caa;
}
.selected .plate-inset {
  stroke: #9db5e2;
}
.selected .plate-symbol {
  stroke: #e8efff;
}
.selected .block-pin {
  fill: #b9d2ff;
}
.selected .block-index {
  color: var(--blue);
}
.invalid .block-kind {
  color: var(--error);
}
.added .block-object {
  animation: block-arrival 480ms var(--ease-out);
}
@keyframes block-arrival {
  from {
    opacity: 0.25;
    transform: translateY(-18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (hover: hover) and (pointer: fine) {
  .chain-block:hover .block-layers {
    transform: translateY(-5px);
  }
  .chain-block:hover .block-index {
    color: var(--blue);
  }
}
@media (prefers-reduced-motion: reduce) {
  .block-layers {
    transition: none;
  }
  .added .block-object {
    animation: none;
  }
}
</style>
