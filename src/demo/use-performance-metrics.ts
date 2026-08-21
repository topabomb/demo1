import { onBeforeUnmount, onMounted, ref } from 'vue'

interface MemoryPerformance extends Performance {
  memory?: { usedJSHeapSize: number }
}

/** Demo diagnostics only; performance telemetry is not an engine dependency. */
export function usePerformanceMetrics() {
  const fps = ref(0)
  const frameP95 = ref(0)
  const longTasks = ref(0)
  const heapMb = ref<number | null>(null)
  let raf = 0
  let last = 0
  let frames: number[] = []
  let observer: PerformanceObserver | undefined

  const loop = (now: number) => {
    if (last > 0) frames.push(now - last)
    last = now
    if (frames.length >= 60) {
      const sorted = [...frames].sort((a, b) => a - b)
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
      const avg = frames.reduce((a, b) => a + b, 0) / frames.length
      frameP95.value = Math.round(p95 * 10) / 10
      fps.value = Math.round(1000 / Math.max(1, avg))
      frames = []
      const memory = (performance as MemoryPerformance).memory
      heapMb.value = memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null
    }
    raf = requestAnimationFrame(loop)
  }

  onMounted(() => {
    raf = requestAnimationFrame(loop)
    if ('PerformanceObserver' in window) {
      try {
        observer = new PerformanceObserver((list) => { longTasks.value += list.getEntries().length })
        observer.observe({ type: 'longtask', buffered: true })
      } catch { /* Safari and Firefox do not expose longtask. */ }
    }
  })

  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    observer?.disconnect()
  })

  return { fps, frameP95, longTasks, heapMb }
}
