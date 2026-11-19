<script setup lang="ts">
import { ref } from 'vue'
import type { Block } from '@/core/ir'
import { useLab } from '@/stores/lab'
import BlockItem from './BlockItem.vue'
import BlockPalette from './BlockPalette.vue'

const props = defineProps<{ blocks: Block[]; stackId: string; parentId?: string; branch?: 'children' | 'elseChildren'; readonly?: boolean }>()
const lab = useLab()

const palette = ref<{ afterId?: string } | null>(null)

function pick(op: string) {
  const at = palette.value
  palette.value = null
  if (at?.afterId) lab.addBlock(op, { afterId: at.afterId })
  else if (props.parentId) lab.addBlock(op, { parentId: props.parentId, branch: props.branch })
  else lab.addBlock(op, { stackId: props.stackId })
}
</script>

<template>
  <div>
    <ol class="m-0 flex flex-col gap-1.5 p-0">
      <BlockItem v-for="(b, i) in blocks" :key="b.id" :block="b" :index="i" :count="blocks.length" :stack-id="stackId" :readonly="readonly" @add="palette = { afterId: $event }" />
    </ol>
    <button
      v-if="!readonly"
      class="btn btn-sm mt-1.5 w-full border-2 border-dashed"
      :class="parentId ? 'border-white/50 bg-white/10' : 'border-line bg-deep'"
      :data-testid="parentId ? 'add-inner-block' : 'add-block'"
      @click="palette = {}"
    >
      ＋ {{ blocks.length ? 'Add a block' : parentId ? 'Add a block inside' : 'Add your first block' }}
    </button>
    <BlockPalette v-if="palette" @pick="pick" @close="palette = null" />
  </div>
</template>
