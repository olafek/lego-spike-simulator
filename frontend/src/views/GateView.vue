<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '@/lib/api'
import { useSession } from '@/stores/session'
import RobotFace from '@/components/RobotFace.vue'

const session = useSession()
const router = useRouter()
const route = useRoute()

const password = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref('')
const cooldown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function startCooldown(seconds: number) {
  cooldown.value = Math.max(1, Math.ceil(seconds))
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && timer) {
      clearInterval(timer)
      timer = null
      error.value = ''
    }
  }, 1000)
}

async function submit() {
  if (busy.value || cooldown.value > 0 || !password.value) return
  busy.value = true
  error.value = ''
  try {
    await session.login(password.value)
    password.value = ''
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
    await router.replace(next)
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'cooldown') {
        startCooldown(e.retryAfter ?? 60)
        error.value = 'Too many tries. Take a short break, then try again.'
      } else if (e.code === 'wrong_password') {
        const left = typeof e.extra.attemptsLeft === 'number' ? e.extra.attemptsLeft : null
        error.value = `That is not the lab password.${left !== null ? ` ${left} ${left === 1 ? 'try' : 'tries'} left.` : ''}`
      } else if (e.code === 'not_configured') {
        error.value = 'The lab is not set up yet. Ask your teacher to set the lab password on the server.'
      } else error.value = e.message
    } else error.value = 'Something went wrong. Please try again.'
    password.value = ''
  } finally {
    busy.value = false
  }
}

onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<template>
  <div class="scroll-y flex h-full items-center justify-center p-4">
    <form class="card pop w-full max-w-md p-6 text-center sm:p-8" data-testid="gate" novalidate @submit.prevent="submit">
      <RobotFace class="mx-auto h-24 w-24" :class="error ? '' : 'wiggle'" :mood="error ? 'oops' : 'happy'" />
      <h1 class="mt-3 text-3xl font-black">SPIKE <span class="text-sun">Lab</span></h1>
      <p class="muted mt-1">Enter the lab password to start.</p>

      <label for="lab-password" class="mt-6 block text-left text-sm font-extrabold">Lab password</label>
      <div class="mt-1 flex gap-2">
        <input
          id="lab-password"
          v-model="password"
          class="field text-lg"
          :type="show ? 'text' : 'password'"
          autocomplete="current-password"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          :aria-invalid="!!error"
          aria-describedby="gate-error"
          data-testid="gate-password"
          :disabled="cooldown > 0"
        />
        <button type="button" class="btn btn-ghost" :aria-pressed="show" :aria-label="show ? 'Hide password' : 'Show password'" data-testid="gate-toggle" @click="show = !show">
          {{ show ? '🙈' : '👀' }}
        </button>
      </div>

      <p id="gate-error" role="alert" aria-live="assertive" class="mt-3 min-h-6 font-bold text-danger" data-testid="gate-error">
        {{ error }}<span v-if="cooldown > 0"> ({{ cooldown }} s)</span>
      </p>

      <button type="submit" class="btn btn-sun btn-xl mt-2 w-full" :disabled="busy || cooldown > 0 || !password" data-testid="gate-submit">
        {{ busy ? 'Checking…' : cooldown > 0 ? `Wait ${cooldown} s` : 'Open the lab 🚀' }}
      </button>
      <p class="muted mt-4 text-xs">Everyone in the lab shares this one password. It keeps strangers out; it does not keep your projects secret from other lab members.</p>
    </form>
  </div>
</template>
