<script setup lang="ts">
import type { LabNode } from './types'
defineProps<{ nodes: LabNode[]; selected?: string }>()
defineEmits<{ select: [id: string] }>()
const labels = { running: '运行中', stopped: '已停止', starting: '正在启动', stopping: '正在停止', error: '异常' }
</script>
<template>
  <nav class="node-list" aria-label="实验节点">
    <div class="section-heading"><h2>实验节点</h2><span>{{ nodes.length }} 个</span></div>
    <button v-for="node in nodes" :key="node.id" class="node-row" :class="{ selected: selected === node.id }"
      :aria-pressed="selected === node.id" :aria-label="`选择节点 ${node.name}`" @click="$emit('select', node.id)">
      <span class="node-letter">{{ node.name }}</span>
      <span class="node-description"><strong>节点 {{ node.name }}</strong><span><i class="dot" :class="node.status"></i>{{ labels[node.status] }}</span></span>
      <span class="node-count">{{ node.info?.blockCount ?? '—' }}<small>区块</small></span>
    </button>
    <p class="sidebar-note">每个节点都是独立运行的程序，有自己的区块链副本。连接后，节点通过 P2P 交换并验证区块。</p>
  </nav>
</template>
