<script setup lang="ts">
import { computed } from 'vue'
import { COLOR_NAMES, PORTS } from '@/core/catalog'
import { conditionText, type Condition } from '@/core/ir'

const props = defineProps<{ condition: Condition | undefined; disabled?: boolean }>()
const emit = defineEmits<{ update: [Condition] }>()

const c = computed(() => props.condition ?? ({ type: 'unknown', text: '' } as Condition))
const simple = computed(() => ['color', 'distance', 'force', 'reflection', 'unknown'].includes(c.value.type) || isTimer.value)
const isTimer = computed(() => {
  const v = c.value
  return v.type === 'compare' && typeof v.left === 'object' && v.left !== null && v.left.type === 'sensor' && v.left.sensor === 'timer' && (typeof v.right === 'number' || v.right === null)
})
const kind = computed(() => (isTimer.value ? 'timer' : c.value.type))

function setKind(k: string) {
  const defaults: Record<string, Condition> = {
    color: { type: 'color', port: null, color: 'black' },
    distance: { type: 'distance', port: null, comparator: 'closer_than', value: 15, unit: 'cm' },
    force: { type: 'force', port: null, state: 'pressed' },
    reflection: { type: 'reflection', port: null, comparator: '<', value: 50 },
    timer: { type: 'compare', left: { type: 'sensor', sensor: 'timer' }, comparator: '>', right: 1 },
  }
  if (defaults[k]) emit('update', defaults[k])
}

function patch(p: Record<string, unknown>) {
  emit('update', { ...(c.value as object), ...p } as Condition)
}

function numOrNull(e: Event): number | null {
  const v = (e.target as HTMLInputElement).value.trim().replace(',', '.')
  return v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
}

const str = (e: Event) => (e.target as HTMLSelectElement).value
const val = (v: unknown) => (typeof v === 'number' ? v : '')
</script>

<template>
  <span class="inline-flex flex-wrap items-center gap-1.5 rounded-2xl bg-black/15 px-2 py-1">
    <template v-if="simple">
      <select class="block-input" :value="kind" :disabled="disabled" aria-label="What to check" @change="setKind(str($event))">
        <option v-if="kind === 'unknown'" value="unknown">choose…</option>
        <option value="color">colour sensor</option>
        <option value="distance">distance sensor</option>
        <option value="force">force sensor</option>
        <option value="reflection">reflected light</option>
        <option value="timer">timer</option>
      </select>

      <template v-if="c.type === 'color' || c.type === 'distance' || c.type === 'force' || c.type === 'reflection'">
        <select class="block-input" :class="{ 'is-missing': c.port === null }" :value="c.port ?? ''" :disabled="disabled" aria-label="Sensor port" @change="patch({ port: str($event) || null })">
          <option value="" disabled>port ?</option>
          <option v-for="p in PORTS" :key="p" :value="p">{{ p }}</option>
        </select>
      </template>

      <template v-if="c.type === 'color'">
        <span>sees</span>
        <select class="block-input" :class="{ 'is-missing': c.color === null }" :value="c.color ?? ''" :disabled="disabled" aria-label="Colour" @change="patch({ color: str($event) || null })">
          <option value="" disabled>colour ?</option>
          <option v-for="n in COLOR_NAMES" :key="n" :value="n">{{ n === 'none' ? 'no colour' : n }}</option>
        </select>
      </template>

      <template v-else-if="c.type === 'distance'">
        <span>is</span>
        <select class="block-input" :value="c.comparator" :disabled="disabled" aria-label="Compare" @change="patch({ comparator: str($event) })">
          <option value="closer_than">closer than</option>
          <option value="farther_than">farther than</option>
          <option value="exactly">exactly</option>
        </select>
        <input class="block-input w-16" :class="{ 'is-missing': c.value === null }" inputmode="decimal" :value="val(c.value)" :disabled="disabled" aria-label="Distance" @change="patch({ value: numOrNull($event) })" />
        <select class="block-input" :value="c.unit" :disabled="disabled" aria-label="Unit" @change="patch({ unit: str($event) })">
          <option value="cm">cm</option>
          <option value="in">inches</option>
          <option value="%">%</option>
        </select>
      </template>

      <template v-else-if="c.type === 'force'">
        <span>is</span>
        <select class="block-input" :value="c.state" :disabled="disabled" aria-label="Force state" @change="patch({ state: str($event) })">
          <option value="pressed">pressed</option>
          <option value="hard_pressed">hard pressed</option>
          <option value="released">released</option>
        </select>
      </template>

      <template v-else-if="c.type === 'reflection'">
        <select class="block-input" :value="c.comparator" :disabled="disabled" aria-label="Compare" @change="patch({ comparator: str($event) })">
          <option value="<">&lt;</option>
          <option value=">">&gt;</option>
          <option value="=">=</option>
        </select>
        <input class="block-input w-16" :class="{ 'is-missing': c.value === null }" inputmode="decimal" :value="val(c.value)" :disabled="disabled" aria-label="Percent" @change="patch({ value: numOrNull($event) })" />
        <span>%</span>
      </template>

      <template v-else-if="c.type === 'compare'">
        <select class="block-input" :value="c.comparator" :disabled="disabled" aria-label="Compare" @change="patch({ comparator: str($event) })">
          <option value=">">&gt;</option>
          <option value="<">&lt;</option>
        </select>
        <input class="block-input w-16" :class="{ 'is-missing': c.right === null }" inputmode="decimal" :value="val(c.right)" :disabled="disabled" aria-label="Seconds" @change="patch({ right: numOrNull($event) })" />
        <span>s</span>
      </template>

      <span v-else-if="c.type === 'unknown' && c.text" class="text-sm italic opacity-90">“{{ c.text }}”</span>
    </template>

    <!-- compound conditions are shown exactly as read; replace them with a simple check to edit -->
    <template v-else>
      <span class="text-sm font-bold">{{ conditionText(c) }}</span>
      <select class="block-input" value="" :disabled="disabled" aria-label="Replace this condition" @change="setKind(str($event))">
        <option value="" disabled>change…</option>
        <option value="color">colour sensor</option>
        <option value="distance">distance sensor</option>
        <option value="force">force sensor</option>
        <option value="reflection">reflected light</option>
        <option value="timer">timer</option>
      </select>
    </template>
  </span>
</template>
