<script setup lang="ts">
defineProps<{
  name:
    | 'plus'
    | 'minus'
    | 'refresh'
    | 'close'
    | 'copy'
    | 'check'
    | 'left'
    | 'right'
    | 'fit'
    | 'target'
    | 'network'
    | 'arrow'
    | 'search'
    | 'cube'
    | 'external'
}>()
const paths = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 18 17',
  close: 'm6 6 12 12M6 18 18 6',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  check: 'm5 12 4 4L19 6',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  fit: 'M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5',
  target: 'M12 3v3m0 12v3M3 12h3m12 0h3M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM12 10v4m-2-2h4',
  network: 'M12 3v6m0 6v6M3 12h6m6 0h6M9 9h6v6H9z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 5 5',
  cube: 'm12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10v8M3 8l9 5 9-5',
  external: 'M14 3h7v7m0-7L10 14M10 4H4v16h16v-6',
}
</script>

<template>
  <svg
    class="app-icon"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>

<style scoped>
.app-icon {
  flex: 0 0 auto;
  vertical-align: middle;
}
</style>
