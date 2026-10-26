<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import type { LabAction, LabNode, LabPayload } from './types'
const props = defineProps<{ node: LabNode; nodes: LabNode[]; busy: boolean; ready: boolean; links: [string, string][]; perform: (action: LabAction, payload?: LabPayload) => Promise<boolean> }>()
const data = shallowRef('')
const target = shallowRef('')
const running = computed(() => props.node.status === 'running')
const peers = computed(() => props.nodes.filter(node => node.id !== props.node.id && node.status === 'running'))
const connectedNames = computed(() => props.nodes.filter(node => props.node.info?.peers.includes(`127.0.0.1:${node.info?.p2pPort}`)).map(node => node.name))
const linked = computed(() => props.links.some(link => link.includes(props.node.id) && link.includes(target.value)))
watch(peers, (nodes) => { if (!nodes.some(node => node.id === target.value)) target.value = nodes[0]?.id ?? '' }, { immediate: true })
async function mine() { if (await props.perform('mine', { id: props.node.id, data: data.value })) data.value = '' }
</script>
<template>
  <section class="operation-panel" aria-label="节点操作">
    <div class="node-title"><div><span class="muted">当前操作</span><h2>节点 {{ node.name }}</h2></div>
      <button :disabled="busy || !ready || node.status === 'starting' || node.status === 'stopping'"
        @click="perform(running ? 'stop' : 'start', { id: node.id })">{{ running ? '停止节点' : '启动节点' }}</button>
    </div>
    <p v-if="node.error" class="error" role="alert">{{ node.error }}</p>
    <div class="measurements">
      <div><span>区块总数</span><strong data-testid="block-count">{{ node.info?.blockCount ?? '—' }}</strong><small>包含创世区块</small></div>
      <div><span>实际连接</span><strong>{{ connectedNames.join('、') || '无' }}</strong><small>根据节点当前 TCP 连接采样</small></div>
      <div><span>保存状态</span><strong class="save-state">{{ running ? '已加载' : '文件保留' }}</strong><small>每次有效链变更自动保存</small></div>
    </div>
    <form class="mine-form" @submit.prevent="mine">
      <label for="block-data">写入新区块的内容</label>
      <textarea id="block-data" v-model="data" :disabled="!running || busy" maxlength="8192" placeholder="例如：记录一次课程实验。内容会成为区块数据。"></textarea>
      <div class="form-footer"><p>执行真实工作量证明（PoW），校验并保存后广播。</p><button class="primary" :disabled="!running || busy || !ready || !data.trim()" type="submit">{{ busy ? '正在处理…' : '挖矿生成区块' }}</button></div>
    </form>
    <div class="connection-controls"><label for="connection-target">连接到节点</label>
      <select id="connection-target" v-model="target" :disabled="busy"><option value="" disabled>没有其他在线节点</option><option v-for="peer in peers" :key="peer.id" :value="peer.id">节点 {{ peer.name }}</option></select>
      <button :disabled="busy || !running || !target || !ready" @click="perform(linked ? 'disconnect' : 'connect', { id: node.id, target })">{{ linked ? '断开连接' : '连接节点' }}</button>
    </div>
    <p class="connection-note">断开后，两边仍可独立挖矿。重新连接时，节点只接受通过验证的更长链；等长分叉不会自动合并。</p>
    <details class="technical"><summary>技术详情：端口、哈希和节点身份</summary>
      <dl><dt>节点 ID</dt><dd>{{ node.id }}</dd><dt>P2P 门牌号</dt><dd>{{ node.info?.p2pPort ?? '未监听' }}</dd>
        <dt>HTTP API</dt><dd>{{ node.info ? `http://127.0.0.1:${node.info.apiPort}` : '未启动' }}</dd>
        <dt>最新区块 Hash</dt><dd>{{ node.info?.latestHash ?? '节点停止时不读取内存快照' }}</dd></dl>
      <p>端口是找到程序的地址，节点身份与区块文件由 ID 关联。换端口不等于换区块链。</p>
      <details><summary>查看原始节点日志（最近 10,000 字符）</summary><pre class="raw-log">{{ node.logs || '暂无日志' }}</pre></details>
    </details>
  </section>
</template>
