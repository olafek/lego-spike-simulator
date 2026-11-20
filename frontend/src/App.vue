<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useSession } from './stores/session'
import { useLab } from './stores/lab'
import RobotFace from './components/RobotFace.vue'
import { DEMO } from './lib/demo'

const session = useSession()
const lab = useLab()
const route = useRoute()
const router = useRouter()
const authed = computed(() => !!session.info?.authenticated && route.name !== 'login')

async function logout() {
  await lab.saveNow()
  await session.logout()
  lab.reset()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="flex h-full flex-col">
    <header v-if="authed" class="flex shrink-0 items-center gap-2 px-3 py-2 sm:px-5">
      <RouterLink to="/" class="flex items-center gap-2 rounded-xl pr-2 text-lg font-black tracking-tight" aria-label="SPIKE Lab home">
        <RobotFace class="h-10 w-10" />
        <span class="hidden sm:inline">SPIKE <span class="text-sun">Lab</span></span>
      </RouterLink>
      <span v-if="DEMO" class="chip chip-sky" data-testid="demo-chip">Demo</span>
      <div class="flex-1" />
      <RouterLink to="/projects" class="btn btn-ghost btn-sm" data-testid="nav-projects">📁 <span class="hidden sm:inline">Projects</span></RouterLink>
      <button class="btn btn-ghost btn-sm" :aria-pressed="session.sound" :aria-label="session.sound ? 'Turn sounds off' : 'Turn sounds on'" @click="session.sound = !session.sound">
        {{ session.sound ? '🔊' : '🔇' }}
      </button>
      <RouterLink to="/settings" class="btn btn-ghost btn-sm" aria-label="Settings">⚙️</RouterLink>
      <button v-if="!DEMO" class="btn btn-ghost btn-sm" data-testid="logout" @click="logout">🚪 <span class="hidden sm:inline">Leave lab</span></button>
    </header>
    <main class="min-h-0 flex-1">
      <RouterView />
    </main>
  </div>
</template>
