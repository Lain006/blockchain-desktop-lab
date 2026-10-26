<script setup lang="ts">
import type { LabEvent, LabNode } from './types'
defineProps<{ events: LabEvent[]; nodes: LabNode[] }>()
function time(value: number) { return new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) }
</script>
<template>
  <section class="event-panel" aria-label="教学记录">
    <div class="section-heading"><h2>发生了什么</h2><span>真实节点事件 · 最近 150 条</span></div>
    <p v-if="!events.length" class="muted">正在准备实验。操作结果会显示在这里。</p>
    <ol class="events">
      <li v-for="event in events" :key="event.id">
        <time>{{ time(event.time) }}</time>
        <span class="event-node">{{ nodes.find(node => node.id === event.nodeId)?.name ?? '实验' }}</span>
        <div><p>{{ event.text }}</p><details v-if="event.command"><summary>查看等价命令与操作</summary><pre>{{ event.command }}</pre></details></div>
      </li>
    </ol>
  </section>
</template>
