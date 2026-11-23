<script setup lang="ts">
// The numbers for the block that is moving right now: what was asked, what was driven, how far to go.
import type { Readout } from '@/core/timeline'
import { formatLength, round, type DisplayUnit } from '@/core/units'

const props = defineProps<{ move: NonNullable<Readout['move']>; unit: DisplayUnit }>()
const len = (mm: number) => formatLength(mm, props.unit, 1)
</script>

<template>
  <template v-if="move.commandedMm !== null">
    <span class="chip chip-sky">Asked: {{ len(move.commandedMm) }}</span>
    <span class="chip">Driven: {{ len(move.actualMm) }}</span>
    <span class="chip">To go: {{ len(move.remainingMm ?? 0) }}</span>
  </template>
  <template v-else>
    <span v-if="move.commandedDeg !== null" class="chip chip-sky">Asked: turn {{ round(Math.abs(move.commandedDeg), 0) }}° {{ move.commandedDeg < 0 ? 'left' : 'right' }}</span>
    <span class="chip">This block turned: {{ round(move.turnedDeg, 0) }}°</span>
    <span class="chip">Robot centre moved: {{ len(move.actualMm) }}</span>
  </template>
  <span class="muted">Wheels rolled: left {{ len(move.wheelLMm) }}, right {{ len(move.wheelRMm) }}</span>
</template>
