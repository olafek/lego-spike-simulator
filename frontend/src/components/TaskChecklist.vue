<script setup lang="ts">
// The checklist: what the practice pieces on the mat (and the goal) ask of the robot, ticked as the run
// achieves them. It follows the timeline, so stepping back un-ticks what was ticked later.
import { computed } from 'vue'
import { missionComplete } from '@/core/timeline'
import { useLab } from '@/stores/lab'

defineProps<{ finished: boolean }>()

const lab = useLab()
const tasks = computed(() => lab.tasks)
const done = computed(() => tasks.value.filter((t) => t.met).length)
const complete = computed(() => missionComplete(tasks.value))
</script>

<template>
  <div class="notice" :class="finished ? (complete ? 'notice-good' : 'notice-warn') : ''" data-testid="task-checklist">
    <p class="font-black">🎯 What to do</p>
    <ul class="m-0 mt-1 flex list-none flex-col gap-1 p-0">
      <li v-for="t in tasks" :key="t.id" class="flex items-start gap-2 font-bold" :data-met="String(t.met)" data-testid="task-row">
        <span aria-hidden="true">{{ t.met ? '✅' : '⬜' }}</span>
        <span>{{ t.text }}<span class="sr-only">{{ t.met ? ': done' : ': not done yet' }}</span></span>
      </li>
    </ul>
    <p v-if="finished" class="mt-1 font-bold" data-testid="task-count">
      {{ done }} of {{ tasks.length }} done.
      <span v-if="!complete && done < tasks.length">Change a number and try again!</span>
    </p>
    <p class="muted mt-1 text-xs">≈ Practice pieces are simple stand-ins. Real mission models move differently.</p>
  </div>
</template>
