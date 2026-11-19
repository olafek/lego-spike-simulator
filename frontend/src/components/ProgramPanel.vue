<script setup lang="ts">
import { computed } from 'vue'
import { allBlocks, blockNeedsReview } from '@/core/ir'
import { useLab } from '@/stores/lab'
import BlockList from './BlockList.vue'

const lab = useLab()
const program = computed(() => lab.data?.program)
const connected = computed(() => program.value?.stacks.filter((s) => s.hat?.op === 'when_program_starts') ?? [])
const loose = computed(() => program.value?.stacks.filter((s) => s.hat?.op !== 'when_program_starts') ?? [])
const reviewCount = computed(() => (program.value ? connected.value.flatMap((s) => allBlocks({ ...program.value!, stacks: [s] })).filter(blockNeedsReview).length : 0))
const edited = computed(() => !!lab.data?.original && JSON.stringify(lab.data.original) !== JSON.stringify(lab.data.program))
const advanced = computed(() => lab.data?.settings.mode === 'advanced')

function setMode(mode: 'beginner' | 'advanced') {
  lab.change((d) => (d.settings.mode = mode), false)
}
</script>

<template>
  <div v-if="program" class="flex flex-col gap-3" data-testid="program-panel">
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="text-lg font-black">Your blocks</h2>
      <span v-if="reviewCount" class="chip chip-flag" data-testid="review-count">🚩 {{ reviewCount }} to check</span>
      <span v-else-if="connected.some((s) => s.blocks.length)" class="chip chip-leaf" data-testid="review-ok">✓ all checked</span>
      <div class="flex-1" />
      <div class="flex rounded-xl border-2 border-line p-0.5" role="group" aria-label="Editor mode">
        <button class="btn btn-sm border-0" :class="!advanced ? 'bg-ink text-night' : 'bg-transparent'" :aria-pressed="!advanced" @click="setMode('beginner')">Simple</button>
        <button class="btn btn-sm border-0" :class="advanced ? 'bg-ink text-night' : 'bg-transparent'" :aria-pressed="advanced" data-testid="mode-advanced" @click="setMode('advanced')">Advanced</button>
      </div>
    </div>

    <div v-for="s in connected" :key="s.id" class="rounded-2xl border-2 border-line bg-deep/70 p-2" data-testid="stack">
      <div class="mb-1.5 inline-flex min-h-11 items-center rounded-t-3xl rounded-b-xl px-4 font-extrabold" style="background: #f5c402; color: #3b2f00">▶ when program starts</div>
      <BlockList :blocks="s.blocks" :stack-id="s.id" />
      <div v-if="connected.length > 1" class="mt-1.5 text-right">
        <button class="btn btn-ghost btn-sm" @click="lab.removeStack(s.id)">🗑 Remove this stack</button>
      </div>
    </div>
    <p v-if="connected.length > 1" class="muted text-sm">These stacks all start together and run at the same time, just like on the hub.</p>

    <div v-for="s in loose" :key="s.id" class="rounded-2xl border-2 border-dashed border-line p-2" data-testid="loose-stack">
      <p class="mb-1.5 text-sm font-bold text-flag">
        {{ s.hat ? `These blocks start with “${s.hat.text ?? 'another event'}”. SPIKE Lab only runs “when program starts”, so they will not run.` : 'These blocks are not connected to a start block, so they will not run.' }}
      </p>
      <BlockList :blocks="s.blocks" :stack-id="s.id" readonly />
      <div class="mt-1.5 flex flex-wrap gap-2">
        <button class="btn btn-ghost btn-sm" data-testid="connect-stack" @click="lab.connectStack(s.id)">🔗 Run them at program start</button>
        <button class="btn btn-ghost btn-sm" @click="lab.removeStack(s.id)">🗑 Remove</button>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button v-if="advanced" class="btn btn-ghost btn-sm" data-testid="add-stack" @click="lab.addStack()">＋ Another “when program starts”</button>
      <button v-if="edited" class="btn btn-ghost btn-sm" data-testid="restore-original" @click="lab.restoreOriginal()">↩ Back to what the screenshot said</button>
    </div>

    <ul v-if="program.notes.length" class="muted m-0 list-disc pl-5 text-sm">
      <li v-for="(n, i) in program.notes" :key="i">{{ n }}</li>
    </ul>
  </div>
</template>
