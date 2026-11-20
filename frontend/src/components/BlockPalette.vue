<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BLOCKS, CATEGORY_STYLE, type BlockDef, type Category } from '@/core/catalog'
import { useLab } from '@/stores/lab'

const emit = defineEmits<{ pick: [op: string]; close: [] }>()
const lab = useLab()
const advanced = computed(() => lab.data?.settings.mode === 'advanced')
const dialog = ref<HTMLElement | null>(null)

const order: Category[] = ['movement', 'motors', 'control', 'sensors', 'variables', 'light', 'sound']
const groups = computed(() =>
  order
    .map((cat) => ({ cat, style: CATEGORY_STYLE[cat], blocks: BLOCKS.filter((b) => b.category === cat && (advanced.value || !b.advanced)) }))
    .filter((g) => g.blocks.length > 0),
)

// Show each block the way it will look once added: the starting value sits in every slot.
type Piece = { text: string; slot?: 'number' | 'choice' | 'condition' }
function pieces(b: BlockDef): Piece[] {
  const out: Piece[] = []
  for (const part of b.template.split(/(\{\w+\})/)) {
    const m = part.match(/^\{(\w+)\}$/)
    if (!m) {
      if (part.trim()) out.push({ text: part.trim() })
    } else if (m[1] === 'condition') {
      out.push({ text: 'something', slot: 'condition' })
    } else {
      const p = b.params.find((x) => x.name === m[1])
      if (!p) continue
      const value = String(p.default)
      out.push({ text: p.optionLabels?.[value] ?? value, slot: p.kind === 'number' ? 'number' : 'choice' })
    }
  }
  return out
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  dialog.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" @click.self="emit('close')">
      <div ref="dialog" class="card pop scroll-y max-h-[85dvh] w-full max-w-2xl rounded-b-none p-4 outline-none sm:rounded-b-[1.25rem]" role="dialog" aria-modal="true" aria-label="Add a block" tabindex="-1" data-testid="block-palette">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-xl font-black">Add a block</h2>
          <button class="btn btn-ghost btn-sm" aria-label="Close" @click="emit('close')">✕</button>
        </div>
        <div v-for="g in groups" :key="g.cat" class="mb-3">
          <h3 class="mb-1 text-sm font-extrabold uppercase tracking-wide" :style="{ color: g.style.color }">{{ g.style.label }}</h3>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              v-for="b in g.blocks"
              :key="b.op"
              class="flex min-h-12 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-2xl px-3 py-2 text-left font-extrabold shadow-[0_3px_0_rgba(0,0,0,0.25)] active:translate-y-0.5"
              :style="{ background: g.style.color, color: g.style.ink }"
              :data-testid="`palette-${b.op}`"
              @click="emit('pick', b.op)"
            >
              <template v-for="(p, i) in pieces(b)" :key="i">
                <span v-if="!p.slot">{{ p.text }}</span>
                <span v-else-if="p.slot === 'number'" class="rounded-full bg-white px-2 py-0.5 text-sm text-[#1b1f2a]">{{ p.text }}</span>
                <span v-else-if="p.slot === 'choice'" class="rounded-full border-2 border-white/35 bg-black/20 px-2 py-0.5 text-sm text-white">{{ p.text }}</span>
                <span v-else class="rounded-md border-2 border-dashed border-current px-2 py-0.5 text-sm opacity-80">{{ p.text }}</span>
              </template>
            </button>
          </div>
        </div>
        <p v-if="!advanced" class="muted text-sm">Looking for variables or tank steering? Switch to <b>Advanced</b> above the program.</p>
      </div>
    </div>
  </Teleport>
</template>
