<script setup lang="ts">
import { shallowRef, computed, watch, nextTick, useTemplateRef } from 'vue'
import { useLab } from './useLab'
import NodeList from './NodeList.vue'
import NodeOperations from './NodeOperations.vue'
import EventLog from './EventLog.vue'
const { state, selectedId, active, busy, error, perform } = useLab()
const adding = shallowRef(false)
const newTarget = shallowRef('')
const dialog = useTemplateRef<HTMLDialogElement>('addDialog')
watch(adding, async (value) => {
  await nextTick()
  if (value) dialog.value?.showModal()
  else dialog.value?.close()
})
const online = computed(() => state.value.nodes.filter(node => node.status === 'running'))
function showAdd() { newTarget.value = active.value?.status === 'running' ? active.value.id : online.value[0]?.id ?? ''; adding.value = true }
async function add() { if (await perform('add', { target: newTarget.value })) adding.value = false }
</script>
<template>
  <div class="lab-shell">
    <header class="app-header"><div class="brand-mark" aria-hidden="true">⬡</div><div><h1>区块链教学控制台</h1><p>启动节点，写下数据，观察共识发生。</p></div>
      <div class="header-actions"><button :disabled="!state.observationUrl" @click="perform('openObservation')">打开只读观测站 ↗</button><button @click="perform('openData')">数据目录</button></div>
    </header>
    <div class="experiment-bar"><span><i class="dot" :class="state.ready ? 'running' : 'starting'"></i>{{ state.ready ? '我的本机实验' : '正在恢复实验…' }}</span><span>关闭软件会停止节点，已保存的区块将在下次恢复。</span><button class="primary" :disabled="busy || !state.ready || !!state.error" @click="showAdd">＋ 新增节点</button></div>
    <p v-if="error || state.error" class="error global-error" role="alert">{{ error || state.error }}</p>
    <main class="workspace"><aside><NodeList :nodes="state.nodes" :selected="active?.id" @select="selectedId = $event" />
      <div class="learning-note"><h3>先动手，再看原理</h3><p>选择节点，写入一段文字并挖矿。已连接的节点收到区块后，会独立验证并保存。</p><p>展开教学记录中的等价命令，可以对照课程学习每一步。</p></div></aside>
      <div class="main-column"><NodeOperations v-if="active" :key="active.id" :node="active" :nodes="state.nodes" :busy="busy" :ready="state.ready" :links="state.links" :perform="perform" />
        <div v-else class="operation-panel">正在读取实验配置…</div>
        <EventLog :events="state.events" :nodes="state.nodes" />
      </div>
    </main>
    <footer class="app-footer">本机课程实验 · 每个节点独立存储 · 真实 TCP P2P <span>管理在这里完成，观测站始终只读。</span></footer>
    <dialog ref="addDialog" class="add-dialog" aria-labelledby="add-title" @cancel="adding = false" @close="adding = false">
      <h2 id="add-title">新增一个独立节点</h2><p>程序会分配空闲端口，创建新的区块文件。连接后通过 P2P 获取有效长链。</p>
      <label for="new-target">启动后连接到</label><select id="new-target" v-model="newTarget"><option value="">暂不连接，独立运行</option><option v-for="node in online" :key="node.id" :value="node.id">节点 {{ node.name }}</option></select>
      <div class="dialog-actions"><button :disabled="busy" @click="adding = false">取消</button><button class="primary" :disabled="busy" @click="add">{{ busy ? '正在创建…' : '创建并启动' }}</button></div>
    </dialog>
  </div>
</template>
