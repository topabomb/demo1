import { computed, ref, type WritableComputedRef } from 'vue'

// Virtual rows are intentionally unmounted/re-mounted. Keep only user-touched
// disclosure state outside row components so folding survives virtualization
// without creating state for untouched million-history items.
const touched = new Map<string, boolean>()

export function useFoldState(id: string, defaultOpen = false): WritableComputedRef<boolean> {
  const local = ref(touched.get(id) ?? defaultOpen)
  return computed({
    get: () => local.value,
    set: (value: boolean) => {
      // Write through synchronously before Vue patches the expanded/collapsed DOM.
      // A ResizeObserver-driven virtualizer may unmount this row in the same frame.
      touched.set(id, value)
      local.value = value
    },
  })
}

export function touchedFoldStateCount(): number {
  return touched.size
}
