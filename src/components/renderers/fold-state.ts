import { ref, watch, type Ref } from 'vue'

// Virtual rows are intentionally unmounted/re-mounted. Keep only user-touched
// disclosure state outside row components so folding survives virtualization
// without creating state for untouched million-history items.
const touched = new Map<string, boolean>()

export function useFoldState(id: string, defaultOpen = false): Ref<boolean> {
  const open = ref(touched.get(id) ?? defaultOpen)
  watch(open, value => touched.set(id, value))
  return open
}

export function touchedFoldStateCount(): number {
  return touched.size
}
