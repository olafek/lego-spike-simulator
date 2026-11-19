<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { BLOCKS, CATEGORY_STYLE, type Category } from '@/core/catalog'
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

const label = (template: string) => template.replace(/\{\w+\}/g, '◯').replace(/\s+/g, ' ')

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
              class="min-h-12 rounded-2xl px-3 py-2 text-left font-extrabold shadow-[0_3px_0_rgba(0,0,0,0.25)] active:translate-y-0.5"
              :style="{ background: g.style.color, color: g.style.ink }"
              :data-testid="`palette-${b.op}`"
              @click="emit('pick', b.op)"
            >
              {{ label(b.template) }}
            </button>
          </div>
        </div>
        <p v-if="!advanced" class="muted text-sm">Looking for variables or tank steering? Switch to <b>Advanced</b> above the program.</p>
      </div>
    </div>
  </Teleport>
</template>
