import { computed, onMounted, onScopeDispose, shallowRef, watch, type Ref } from 'vue'
import type { CameraState } from '../types'

export const BLOCK_STEP_X = 244
export const BLOCK_STEP_Y = -86
export const blockPosition = (position: number) => ({
  x: position * BLOCK_STEP_X,
  y: position * BLOCK_STEP_Y,
})
export const clampZoom = (value: number) => Math.max(0.4, Math.min(1.8, value))

export function useChainCamera(
  element: Readonly<Ref<HTMLElement | null>>,
  nodeId: Readonly<Ref<string>>,
  count: Readonly<Ref<number>>,
) {
  const camera = shallowRef<CameraState>({ x: 0, y: 0, zoom: 1 })
  const size = shallowRef({ width: 800, height: 500 })
  const dragging = shallowRef(false)
  const moving = shallowRef(false)
  const saved = new Map<string, CameraState>()
  let observer: ResizeObserver | undefined
  let animationTimer: ReturnType<typeof setTimeout> | undefined
  let pointer: {
    id: number
    startX: number
    startY: number
    x: number
    y: number
    moved: boolean
  } | null = null
  let suppressClick = false
  let clickTimer: ReturnType<typeof setTimeout> | undefined

  const worldStyle = computed(() => ({
    transform: `translate(${camera.value.x}px, ${camera.value.y}px) scale(${camera.value.zoom})`,
  }))
  const visibleRange = computed(() => {
    const { x, zoom } = camera.value
    const first = Math.max(0, Math.floor((-x / zoom - 260) / BLOCK_STEP_X))
    const last = Math.min(
      count.value - 1,
      Math.ceil(((size.value.width - x) / zoom + 260) / BLOCK_STEP_X),
    )
    return { first, last }
  })

  function setCamera(value: CameraState, animate = true) {
    clearTimeout(animationTimer)
    moving.value = animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    camera.value = value
    saved.set(nodeId.value, value)
    if (moving.value)
      animationTimer = setTimeout(() => {
        moving.value = false
      }, 240)
  }

  function locate(position: number, animate = true) {
    const point = blockPosition(position)
    setCamera(
      {
        ...camera.value,
        x: size.value.width * 0.5 - (point.x + 96) * camera.value.zoom,
        y: (size.value.height - 80) * 0.5 - (point.y + 105) * camera.value.zoom,
      },
      animate,
    )
  }

  function fit(position = count.value - 1, animate = true) {
    const countToFit = Math.min(count.value, size.value.width < 600 ? 1 : 4)
    const zoom = clampZoom(
      Math.min(
        1,
        (size.value.width - 100) / Math.max(200, (countToFit - 1) * BLOCK_STEP_X + 200),
        (size.value.height - 100) / Math.max(210, (countToFit - 1) * Math.abs(BLOCK_STEP_Y) + 210),
      ),
    )
    const center =
      count.value <= countToFit
        ? Math.max(0, count.value - 1) / 2
        : Math.max(0, position - (countToFit - 1) / 2)
    const point = blockPosition(center)
    setCamera(
      {
        zoom,
        x: size.value.width / 2 - (point.x + 96) * zoom,
        y: (size.value.height - 80) / 2 - (point.y + 105) * zoom,
      },
      animate,
    )
  }

  function zoomBy(amount: number, animate = true) {
    const before = camera.value
    const zoom = clampZoom(Math.round((before.zoom + amount) * 100) / 100)
    const ratio = zoom / before.zoom
    setCamera(
      {
        zoom,
        x: size.value.width / 2 - (size.value.width / 2 - before.x) * ratio,
        y: (size.value.height - 80) / 2 - ((size.value.height - 80) / 2 - before.y) * ratio,
      },
      animate,
    )
  }

  function pointerDown(event: PointerEvent) {
    if (pointer || event.button !== 0 || (event.target as HTMLElement).closest('button, input, a'))
      return
    pointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: camera.value.x,
      y: camera.value.y,
      moved: false,
    }
    element.value?.setPointerCapture(event.pointerId)
    moving.value = false
  }

  function pointerMove(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return
    const dx = event.clientX - pointer.startX
    const dy = event.clientY - pointer.startY
    if (!pointer.moved && Math.hypot(dx, dy) < 6) return
    pointer.moved = true
    dragging.value = true
    setCamera({ ...camera.value, x: pointer.x + dx, y: pointer.y + dy }, false)
  }

  function pointerUp(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return
    suppressClick = pointer.moved
    pointer = null
    dragging.value = false
    if (element.value?.hasPointerCapture(event.pointerId))
      element.value.releasePointerCapture(event.pointerId)
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => {
      suppressClick = false
    }, 0)
  }

  function consumeClick() {
    return suppressClick
  }

  watch(
    nodeId,
    () => {
      pointer = null
      dragging.value = false
      const previous = saved.get(nodeId.value)
      if (previous) setCamera(previous, false)
      else fit(count.value - 1, false)
    },
    { flush: 'post' },
  )
  watch(
    count,
    (next, before) => {
      if (next > 0 && before === 0) fit(next - 1, false)
    },
    { flush: 'post' },
  )
  onMounted(() => {
    observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const oldSize = size.value
      size.value = { width: entry.contentRect.width, height: entry.contentRect.height }
      if (!saved.has(nodeId.value) || Math.abs(size.value.width - oldSize.width) > 80)
        fit(count.value - 1, false)
      else
        setCamera(
          {
            ...camera.value,
            x: camera.value.x + (size.value.width - oldSize.width) / 2,
            y: camera.value.y + (size.value.height - oldSize.height) / 2,
          },
          false,
        )
    })
    if (element.value) observer.observe(element.value)
  })
  onScopeDispose(() => {
    observer?.disconnect()
    clearTimeout(animationTimer)
    clearTimeout(clickTimer)
  })
  return {
    camera,
    size,
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
  }
}
