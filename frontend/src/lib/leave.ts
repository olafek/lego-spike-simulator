import type { Router } from 'vue-router'
import { useLab } from '@/stores/lab'
import { useSession } from '@/stores/session'

/** Save the open project, end the lab session and go back to the password screen. */
export async function leaveLab(router: Router): Promise<void> {
  const lab = useLab()
  await lab.saveNow()
  await useSession().logout()
  lab.reset()
  await router.replace({ name: 'login' })
}
