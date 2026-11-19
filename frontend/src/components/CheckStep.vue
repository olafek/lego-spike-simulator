<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'
import ProgramPanel from './ProgramPanel.vue'
import ScreenshotPanel from './ScreenshotPanel.vue'
import RobotFace from './RobotFace.vue'

const lab = useLab()
const session = useSession()
const emit = defineEmits<{ done: [] }>()

const data = computed(() => lab.data!)
const hasShots = computed(() => lab.screenshots.length > 0)
const hasBlocks = computed(() => data.value.program.stacks.some((s) => s.blocks.length > 0))
const confirmReread = ref(false)
const picturesChanged = ref(false)

async function read() {
  confirmReread.value = false
  picturesChanged.value = false
  await lab.recognise()
  void session.refresh()
}

function askReread() {
  // reading again replaces the blocks, so ask first when the child has blocks already
  if (hasBlocks.value) confirmReread.value = true
  else void read()
}
</script>

<template>
  <div class="scroll-y h-full" data-testid="check-step">
    <div class="mx-auto flex max-w-7xl flex-col gap-3 px-3 pb-8">
      <!-- recognising -->
      <div v-if="lab.recognising" class="card flex flex-col items-center gap-3 p-6 text-center" role="status" aria-live="polite" data-testid="recognising">
        <RobotFace class="wiggle h-20 w-20" mood="think" />
        <p class="text-2xl font-black">Reading your blocks…</p>
        <p class="muted">Looking at every block, number and port. This can take up to a minute.</p>
        <div class="relative h-3 w-full max-w-sm overflow-hidden rounded-full bg-deep"><div class="absolute inset-y-0 w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full bg-sun" /></div>
      </div>

      <div v-else-if="lab.recogniseError" class="notice notice-bad" role="alert" data-testid="recognise-error">
        <p class="text-lg font-black">😕 {{ lab.recogniseError.message }}</p>
        <ul v-if="lab.recogniseError.details.length" class="muted m-0 mt-1 list-disc pl-5 text-sm">
          <li v-for="d in lab.recogniseError.details.slice(0, 6)" :key="d">{{ d }}</li>
        </ul>
        <div class="mt-3 flex flex-wrap gap-2">
          <button v-if="hasShots" class="btn btn-sun btn-sm" data-testid="recognise-retry" @click="read">🔁 Try again</button>
          <button class="btn btn-ghost btn-sm" @click="lab.recogniseError = null">🧩 Build the blocks by hand</button>
        </div>
      </div>

      <template v-if="!lab.recognising">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-2xl font-black">{{ hasShots ? 'Did we read it right?' : 'Build your program' }}</h2>
          <span v-if="data.recognition?.driver === 'mock'" class="chip chip-est" data-testid="mock-chip">Practice mode: a stored example, not read from your picture</span>
          <div class="flex-1" />
          <button v-if="hasShots" class="btn btn-ghost btn-sm" data-testid="reread" @click="askReread">🔁 {{ data.recognition ? 'Read the picture again' : 'Read my picture' }}</button>
        </div>
        <p v-if="hasShots" class="muted -mt-2">Compare the picture with the blocks. Fix anything with a 🚩. We never guess a number we could not read.</p>

        <div v-if="confirmReread" class="notice notice-warn flex flex-wrap items-center gap-2" role="alertdialog" aria-label="Read the picture again?" data-testid="reread-confirm">
          <span class="flex-1 font-bold">Reading again replaces the blocks below, including your changes. OK?</span>
          <button class="btn btn-sun btn-sm" data-testid="reread-yes" @click="read">Yes, read again</button>
          <button class="btn btn-ghost btn-sm" @click="confirmReread = false">Keep my blocks</button>
        </div>
        <p v-if="picturesChanged && data.recognition && !confirmReread" class="notice notice-warn font-bold" data-testid="pictures-changed">You changed the pictures. Tap “Read the picture again” if the blocks should be read again.</p>

        <details v-if="data.recognition?.issues.length" class="notice text-sm" data-testid="recognition-issues">
          <summary class="min-h-8 cursor-pointer font-bold">🔍 {{ data.recognition.issues.length }} thing(s) could not be understood and were flagged</summary>
          <ul class="m-0 mt-1 list-disc pl-5"><li v-for="i in data.recognition.issues" :key="i">{{ i }}</li></ul>
        </details>

        <div class="grid gap-3" :class="hasShots ? 'lg:grid-cols-2' : ''">
          <div v-if="hasShots" class="card p-3 lg:sticky lg:top-0 lg:max-h-[78dvh] lg:self-start"><ScreenshotPanel @changed="picturesChanged = true" /></div>
          <div class="card p-3"><ProgramPanel /></div>
        </div>
        <div v-if="!hasShots" class="card p-3"><ScreenshotPanel @changed="picturesChanged = true" /></div>

        <div class="flex flex-wrap items-center justify-end gap-3">
          <span v-if="lab.errorCount" class="chip chip-flag" data-testid="check-blockers">🚩 {{ lab.errorCount }} block{{ lab.errorCount === 1 ? '' : 's' }} still need{{ lab.errorCount === 1 ? 's' : '' }} a value</span>
          <button class="btn btn-sun btn-xl" :disabled="!hasBlocks" data-testid="check-done" @click="emit('done')">Blocks look right ➜</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style>
@keyframes slide {
  0% {
    left: -35%;
  }
  100% {
    left: 100%;
  }
}
</style>
