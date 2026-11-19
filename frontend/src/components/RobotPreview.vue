<script setup lang="ts">
// Top-down drawing of a robot with its tools, generated from the same data the simulator uses.
import { computed } from 'vue'
import { toolRects } from '@/core/attachmentGeometry'
import { ATTACHMENTS, type AttachmentInstance, type RobotConfig } from '@/core/robots'

const props = defineProps<{ robot: RobotConfig; attachments: AttachmentInstance[]; ports?: boolean }>()

const half = computed(() => Math.max(props.robot.chassis.widthMm, props.robot.trackWidthMm + props.robot.wheelWidthMm) / 2)
const tools = computed(() => props.attachments.filter((a) => ATTACHMENTS[a.kind].group === 'tool' || a.kind === 'force_sensor').flatMap((a) => toolRects(props.robot, a, 0).map((r) => ({ ...r, a }))))
const reach = computed(() => Math.max(props.robot.chassis.frontMm, ...tools.value.map((t) => t.y1)))
const view = computed(() => {
  const w = Math.max(half.value + (props.ports ? 22 : 0), ...tools.value.map((t) => Math.max(-t.x0, t.x1))) + 24
  return `${-w} ${-reach.value - 20} ${w * 2} ${reach.value + props.robot.chassis.rearMm + 40}`
})
const wheelR = computed(() => props.robot.wheelDiameterMm / 2)
const sensors = computed(() => props.attachments.filter((a) => ATTACHMENTS[a.kind].sensor && a.kind !== 'force_sensor'))
const mount = (a: AttachmentInstance) => (a.kind === 'distance_sensor' ? { x: 0, y: props.robot.mounts.frontMm - 14 } : a.slot === 1 && props.robot.mounts.colorSensor2 ? props.robot.mounts.colorSensor2 : props.robot.mounts.colorSensor)
</script>

<template>
  <!-- y is flipped: forward is up -->
  <svg :viewBox="view" role="img" :aria-label="`${robot.name} seen from above`">
    <g>
      <rect :x="-robot.chassis.widthMm / 2" :y="-robot.chassis.frontMm" :width="robot.chassis.widthMm" :height="robot.chassis.frontMm + robot.chassis.rearMm" rx="10" fill="#d7dcec" stroke="#8a93a8" stroke-width="3" />
      <rect v-for="s in [-1, 1]" :key="s" :x="(s * robot.trackWidthMm) / 2 - robot.wheelWidthMm / 2" :y="-wheelR" :width="robot.wheelWidthMm" :height="wheelR * 2" rx="5" fill="#1b1f2a" />
      <circle cx="0" :cy="robot.chassis.rearMm - 16" r="9" fill="#8a93a8" />
      <rect x="-28" :y="-robot.chassis.frontMm + 22" width="56" height="88" rx="6" fill="#ffffff" stroke="#c8cedb" stroke-width="2" />
      <rect x="-22" :y="-robot.chassis.frontMm + 28" width="44" height="44" rx="4" fill="#ffd23f" />
      <path :d="`M0 ${-robot.chassis.frontMm + 34} l10 14 h-20 z`" fill="#101a3a" />
      <rect v-for="(t, i) in tools" :key="i" :x="t.x0" :y="-t.y1" :width="t.x1 - t.x0" :height="t.y1 - t.y0" rx="2" :fill="t.a.port ? '#0090f5' : '#4a5273'" stroke="#101a3a" stroke-width="1.5" />
      <g v-for="a in sensors" :key="a.uid">
        <rect :x="mount(a).x - 10" :y="-mount(a).y - 8" width="20" height="16" rx="4" :fill="a.kind === 'color_sensor' ? '#34ccf1' : '#ff4ccd'" stroke="#101a3a" stroke-width="1.5" />
      </g>
      <template v-if="ports">
        <text :x="-robot.trackWidthMm / 2 - robot.wheelWidthMm / 2 - 6" :y="8" text-anchor="end" font-size="22" font-weight="900" fill="#f4f6ff">{{ robot.drive.left.port }}</text>
        <text :x="robot.trackWidthMm / 2 + robot.wheelWidthMm / 2 + 6" :y="8" text-anchor="start" font-size="22" font-weight="900" fill="#f4f6ff">{{ robot.drive.right.port }}</text>
      </template>
    </g>
  </svg>
</template>
