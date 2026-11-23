<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { LabStep } from '@/core/project'
import { usePhone } from '@/lib/phone'
import { useLab } from '@/stores/lab'
import CheckStep from '@/components/CheckStep.vue'
import LabMenu from '@/components/LabMenu.vue'
import MissionEditor from '@/components/MissionEditor.vue'
import RobotStep from '@/components/RobotStep.vue'
import SimulateStep from '@/components/SimulateStep.vue'
import RobotFace from '@/components/RobotFace.vue'

const props = defineProps<{ id: string }>()
const lab = useLab()
const phone = usePhone()
const route = useRoute()
const router = useRouter()

const ALL_STEPS: { id: LabStep; label: string; icon: string }[] = [
  { id: 'check', label: 'Check', icon: '🔍' },
  { id: 'robot', label: 'Robot', icon: '🤖' },
  { id: 'mission', label: 'Mat', icon: '🗺️' },
  { id: 'simulate', label: 'Go!', icon: '▶️' },
]
// a table has no program screenshot, so it has no Check step
const steps = computed(() => (lab.isTable ? ALL_STEPS.filter((s) => s.id !== 'check') : ALL_STEPS))
const step = computed(() => {
  const s = lab.data?.step ?? 'check'
  return lab.isTable && s === 'check' ? 'mission' : s
})

function go(next: LabStep) {
  lab.pause()
  lab.change((d) => (d.step = next), next === 'simulate')
}

watch(
  () => props.id,
  async (id) => {
    await lab.load(id)
    if (route.query.read === '1' && lab.data) {
      await router.replace({ name: 'lab', params: { id } })
      if (lab.screenshots.length) await lab.recognise()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  lab.pause()
  void lab.saveNow()
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="lab.loading" class="flex flex-1 flex-col items-center justify-center gap-3" role="status">
      <RobotFace class="wiggle h-20 w-20" mood="think" />
      <p class="text-xl font-black">Opening your project…</p>
    </div>

    <div v-else-if="!lab.data" class="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <RobotFace class="h-20 w-20" mood="oops" />
      <p class="text-xl font-black" role="alert">{{ lab.loadError ?? 'This project could not be found.' }}</p>
      <RouterLink to="/" class="btn btn-sun">Back to the start</RouterLink>
    </div>

    <template v-else>
      <div class="relative flex shrink-0 flex-wrap items-center gap-2 px-3 pb-2 max-sm:pt-2">
        <LabMenu v-if="phone" />
        <template v-else>
          <input class="field h-11 min-h-11 max-w-64 flex-1 font-extrabold" :value="lab.name" aria-label="Project name" maxlength="80" data-testid="project-name" @change="lab.rename(($event.target as HTMLInputElement).value)" />
          <span class="chip" :class="lab.saveState === 'error' ? 'chip-flag' : ''" role="status" data-testid="save-state">{{ lab.saveText }}</span>
          <button v-if="lab.saveState === 'error'" class="btn btn-ghost btn-sm" @click="lab.saveNow()">Try saving again</button>
        </template>
        <nav class="ml-auto flex gap-1" aria-label="Steps">
          <button
            v-for="(s, i) in steps"
            :key="s.id"
            class="btn btn-ghost btn-sm"
            :class="{ 'is-on': step === s.id }"
            :aria-current="step === s.id ? 'step' : undefined"
            :data-testid="`step-${s.id}`"
            @click="go(s.id)"
          >
            <span aria-hidden="true">{{ s.icon }}</span><span class="max-sm:sr-only">{{ i + 1 }}. {{ s.label }}</span>
          </button>
        </nav>
      </div>
      <p v-if="phone && lab.saveState === 'error'" class="notice notice-warn mx-3 mb-2 flex flex-wrap items-center gap-2 font-bold" role="alert" data-testid="save-warning">
        ⚠️ Not saved.
        <button class="btn btn-ghost btn-sm" @click="lab.saveNow()">Try saving again</button>
      </p>
      <p v-if="lab.loadError" class="notice notice-warn mx-3 mb-2 font-bold" role="alert">{{ lab.loadError }}</p>

      <div class="min-h-0 flex-1">
        <CheckStep v-if="step === 'check'" @done="go('robot')" />
        <RobotStep v-else-if="step === 'robot'" @done="go('mission')" />
        <div v-else-if="step === 'mission'" class="flex h-full min-h-0 flex-col">
          <div class="flex shrink-0 flex-wrap items-center gap-2 px-3 pb-2">
            <p v-if="lab.isTable" class="muted flex-1 text-sm" data-testid="table-hint">🏁 This is a table. Add its picture and the things on it once; every program can then use it.</p>
            <p v-else class="muted flex-1 text-sm">Put things on the mat if you like. You can skip this – the robot drives without a mission too.</p>
            <button class="btn btn-sun" data-testid="mission-done" @click="go('simulate')">Go to the simulator ➜</button>
          </div>
          <div class="min-h-0 flex-1"><MissionEditor /></div>
        </div>
        <SimulateStep v-else @step="go" />
      </div>
    </template>
  </div>
</template>
