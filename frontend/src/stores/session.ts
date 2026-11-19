import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, type SessionInfo } from '@/lib/api'

export const useSession = defineStore('session', () => {
  const info = ref<SessionInfo | null>(null)
  const checked = ref(false)
  const sound = ref(false) // sound effects are muted by default

  async function refresh(): Promise<boolean> {
    try {
      info.value = await api.session()
    } catch {
      info.value = null
    }
    checked.value = true
    return !!info.value?.authenticated
  }

  async function login(password: string): Promise<void> {
    await api.login(password)
    await refresh()
  }

  async function logout(): Promise<void> {
    try {
      await api.logout()
    } finally {
      if (info.value) info.value.authenticated = false
    }
  }

  function markLoggedOut(): void {
    if (info.value) info.value.authenticated = false
  }

  return { info, checked, sound, refresh, login, logout, markLoggedOut }
})
