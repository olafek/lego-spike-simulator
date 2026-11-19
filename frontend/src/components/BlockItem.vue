<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { BLOCK_BY_OP, CATEGORY_STYLE, PORTS, type ParamDef } from '@/core/catalog'
import { blockNeedsReview, blockText, exprText, programText, type Block, type Expr } from '@/core/ir'
import { api, ApiError } from '@/lib/api'
import { useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'
import ConditionEditor from './ConditionEditor.vue'
import BlockList from './BlockList.vue'

const props = defineProps<{ block: Block; index: number; count: number; stackId: string; readonly?: boolean }>()
const emit = defineEmits<{ add: [afterId: string] }>()

const lab = useLab()
const session = useSession()
const root = ref<HTMLElement | null>(null)

const def = computed(() => BLOCK_BY_OP[props.block.op] ?? BLOCK_BY_OP.unsupported)
const style = computed(() => CATEGORY_STYLE[def.value.category])
const selected = computed(() => lab.selectedBlockId === props.block.id)
const running = computed(() => lab.activeBlocks.has(props.block.id))
const review = computed(() => !props.readonly && blockNeedsReview(props.block))
const missing = computed(() => lab.problems.filter((p) => p.blockId === props.block.id && p.level === 'error'))
const canConfirm = computed(() => review.value && missing.value.length === 0 && props.block.op !== 'unsupported')
const advanced = computed(() => lab.data?.settings.mode === 'advanced')

type Token = { text: string } | { param: ParamDef } | { condition: true }
const tokens = computed<Token[]>(() => {
  const out: Token[] = []
  for (const part of def.value.template.split(/(\{\w+\})/)) {
    if (!part) continue
    const m = part.match(/^\{(\w+)\}$/)
    if (!m) out.push({ text: part.trim() })
    else if (m[1] === 'condition') out.push({ condition: true })
    else {
      const p = def.value.params.find((x) => x.name === m[1])
      if (p) out.push({ param: p })
    }
  }
  // params that are not part of the sentence (e.g. "wait until done")
  for (const p of def.value.params) if (!def.value.template.includes(`{${p.name}}`)) out.push({ param: p })
  return out
})

function portOptions(p: ParamDef): string[] {
  if (p.pair) return PORTS.flatMap((a) => PORTS.filter((b) => b !== a).map((b) => `${a}+${b}`))
  if (p.multi) return [...PORTS, ...PORTS.flatMap((a, i) => PORTS.slice(i + 1).map((b) => `${a}+${b}`))]
  return [...PORTS]
}

const isExpr = (v: unknown): v is Exclude<Expr, number> => typeof v === 'object' && v !== null

function onNumber(p: ParamDef, e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim().replace(',', '.')
  if (raw === '' || !Number.isFinite(Number(raw))) {
    lab.setParam(props.block.id, p.name, null)
    return
  }
  let n = Number(raw)
  if (p.min !== undefined) n = Math.max(p.min, n)
  if (p.max !== undefined) n = Math.min(p.max, n)
  lab.setParam(props.block.id, p.name, n)
}

const onSelect = (p: ParamDef, e: Event) => lab.setParam(props.block.id, p.name, (e.target as HTMLSelectElement).value || null)
const onText = (p: ParamDef, e: Event) => lab.setParam(props.block.id, p.name, (e.target as HTMLInputElement).value.trim().slice(0, 120) || null)

function select() {
  if (!props.readonly) lab.selectedBlockId = selected.value ? null : props.block.id
}

// explanation: built-in text first, optional AI on request
const help = ref(false)
const aiText = ref('')
const aiBusy = ref(false)
const aiError = ref('')
async function askAi() {
  if (!lab.data || aiBusy.value) return
  aiBusy.value = true
  aiError.value = ''
  try {
    aiText.value = (await api.explain(blockText(props.block), programText(lab.data.program).slice(0, 3800))).text
  } catch (e) {
    aiError.value = e instanceof ApiError ? e.message : 'The helper is not available right now.'
  } finally {
    aiBusy.value = false
  }
}

watch(running, async (on) => {
  if (!on) return
  await nextTick()
  root.value?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
})

const reviewReason = computed(() => {
  if (props.block.op === 'unsupported') return 'SPIKE Lab cannot run this block yet. It will be skipped.'
  if (missing.value.length) return missing.value[0].message
  if (props.block.uncertain.length) return `Please check: ${props.block.uncertain.join(', ')}.`
  return 'The picture reader was not sure about this block. Is it right?'
})
</script>

<template>
  <li ref="root" class="list-none" :data-testid="`block-${block.op}`" :data-block-id="block.id" :data-running="running ? 'true' : 'false'">
    <div
      class="relative rounded-2xl px-3 py-2 shadow-[0_3px_0_rgba(0,0,0,0.25)] transition"
      :class="[running ? 'ring-4 ring-white' : selected ? 'ring-4 ring-sky' : '', readonly ? 'opacity-55' : '']"
      :style="{ background: style.color, color: style.ink }"
    >
      <div class="flex flex-wrap items-center gap-1.5 text-[1.02rem] font-extrabold leading-tight" @click.self="select">
        <span v-if="running" class="mr-0.5" aria-label="Running now">▶</span>
        <template v-for="(t, i) in tokens" :key="i">
          <span v-if="'text' in t" @click="select">{{ t.text }}</span>
          <ConditionEditor v-else-if="'condition' in t" :condition="block.condition" :disabled="readonly" @update="lab.setCondition(block.id, $event)" />
          <template v-else>
            <span v-if="isExpr(block.params[t.param.name])" class="rounded-full bg-black/25 px-2 py-1 text-sm" :title="'A calculated value'">{{ exprText(block.params[t.param.name] as Expr) }}</span>
            <input
              v-else-if="t.param.kind === 'number'"
              class="block-input w-[4.6rem]"
              :class="{ 'is-missing': block.params[t.param.name] === null }"
              inputmode="decimal"
              :value="block.params[t.param.name] ?? ''"
              :placeholder="'?'"
              :disabled="readonly"
              :aria-label="t.param.name"
              :data-testid="`param-${t.param.name}`"
              @change="onNumber(t.param, $event)"
              @focus="($event.target as HTMLInputElement).select()"
            />
            <select
              v-else-if="t.param.kind === 'enum' || t.param.kind === 'ports'"
              class="block-input"
              :class="{ 'is-missing': block.params[t.param.name] === null }"
              :value="block.params[t.param.name] ?? ''"
              :disabled="readonly"
              :aria-label="t.param.name"
              :data-testid="`param-${t.param.name}`"
              @change="onSelect(t.param, $event)"
            >
              <option value="" disabled>?</option>
              <template v-if="t.param.kind === 'enum'">
                <option v-for="o in t.param.options" :key="o" :value="o">{{ t.param.optionLabels?.[o] ?? o }}</option>
              </template>
              <template v-else>
                <option v-for="o in portOptions(t.param)" :key="o" :value="o">{{ o }}</option>
              </template>
            </select>
            <label v-else-if="t.param.kind === 'bool'" class="inline-flex min-h-10 items-center gap-1 rounded-full bg-black/20 px-2 text-sm">
              <input type="checkbox" class="h-5 w-5" :checked="block.params[t.param.name] === true" :disabled="readonly" @change="lab.setParam(block.id, t.param.name, ($event.target as HTMLInputElement).checked)" />
              until done
            </label>
            <input
              v-else
              class="block-input w-32 text-left"
              :class="{ 'is-missing': block.params[t.param.name] === null }"
              :value="block.params[t.param.name] ?? ''"
              :disabled="readonly"
              :aria-label="t.param.name"
              @change="onText(t.param, $event)"
            />
          </template>
        </template>
        <span v-if="block.op === 'unsupported'" class="text-sm font-bold italic opacity-90">“{{ block.text }}”</span>
        <button v-if="!readonly" class="ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/20 text-lg" :aria-expanded="selected" :aria-label="selected ? 'Close block tools' : 'Open block tools'" data-testid="block-tools" @click="select">
          {{ selected ? '✕' : '⋯' }}
        </button>
      </div>

      <!-- confidence flag: never silently trust an unsure reading -->
      <div v-if="review" class="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-white/95 px-2 py-1.5 text-sm font-bold text-[#5a2c00]" data-testid="block-flag">
        <span class="chip chip-flag">🚩 Check me</span>
        <span class="flex-1">{{ reviewReason }}</span>
        <button v-if="canConfirm" class="btn btn-leaf btn-sm" data-testid="block-confirm" @click="lab.confirmBlock(block.id)">Looks right ✓</button>
      </div>

      <div v-if="advanced && def.support !== 'full' && block.op !== 'unsupported'" class="mt-1 text-xs font-bold opacity-90">
        {{ def.support === 'approx' ? '≈ simulated with approximations' : def.support === 'state' ? 'does not move the robot' : '' }}
      </div>

      <!-- tools -->
      <div v-if="selected && !readonly" class="mt-2 flex flex-wrap gap-2" data-testid="block-actions">
        <button class="btn btn-ghost btn-sm" :disabled="index === 0" aria-label="Move up" @click="lab.moveBlock(block.id, -1)">▲</button>
        <button class="btn btn-ghost btn-sm" :disabled="index === count - 1" aria-label="Move down" @click="lab.moveBlock(block.id, 1)">▼</button>
        <button class="btn btn-ghost btn-sm" data-testid="block-duplicate" @click="lab.duplicateBlock(block.id)">⧉ Copy</button>
        <button class="btn btn-ghost btn-sm" data-testid="block-add-after" @click="emit('add', block.id)">＋ Add below</button>
        <button class="btn btn-ghost btn-sm" :aria-pressed="help" @click="help = !help">❓ What is this?</button>
        <button class="btn btn-ghost btn-sm" data-testid="block-delete" aria-label="Delete block" @click="lab.removeBlock(block.id)">🗑</button>
      </div>
      <div v-if="selected && help" class="mt-2 rounded-xl bg-white/95 p-3 text-sm font-semibold text-[#1b1f2a]">
        <p>{{ def.help }}</p>
        <p v-if="aiText" class="mt-2 border-t border-black/10 pt-2">🤖 {{ aiText }}</p>
        <p v-if="aiError" class="mt-2 text-[#b3261e]">{{ aiError }}</p>
        <button v-if="session.info?.assistant.available && !aiText" class="btn btn-sky btn-sm mt-2" :disabled="aiBusy" @click="askAi">{{ aiBusy ? 'Thinking…' : '🤖 Explain more' }}</button>
      </div>

      <!-- nested blocks -->
      <div v-if="def.container" class="mt-2 rounded-xl bg-black/15 p-2">
        <BlockList :blocks="block.children ?? []" :stack-id="stackId" :parent-id="block.id" branch="children" :readonly="readonly" />
        <template v-if="def.hasElse">
          <div class="my-1.5 text-[1.02rem] font-extrabold">else</div>
          <BlockList :blocks="block.elseChildren ?? []" :stack-id="stackId" :parent-id="block.id" branch="elseChildren" :readonly="readonly" />
        </template>
      </div>
    </div>
  </li>
</template>
