import { onBeforeUnmount, watch, type Ref } from 'vue'

/** Close an open menu or popover on Escape, or on a tap or click outside the given elements. */
export function useDismiss(open: Ref<boolean>, ...inside: Ref<HTMLElement | null>[]): void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') open.value = false
  }
  const onPointer = (e: PointerEvent) => {
    const target = e.target as Node | null
    if (target && inside.some((el) => el.value?.contains(target))) return
    open.value = false
  }
  function stop() {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('pointerdown', onPointer, true)
  }
  watch(open, (now) => {
    stop()
    if (now) {
      window.addEventListener('keydown', onKey)
      window.addEventListener('pointerdown', onPointer, true)
    }
  })
  onBeforeUnmount(stop)
}
