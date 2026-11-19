import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from './stores/session'
import { setUnauthenticatedHandler } from './lib/api'

export const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/GateView.vue'), meta: { open: true } },
    { path: '/', name: 'home', component: () => import('./views/HomeView.vue') },
    { path: '/projects', name: 'projects', component: () => import('./views/ProjectsView.vue') },
    { path: '/settings', name: 'settings', component: () => import('./views/SettingsView.vue') },
    { path: '/p/:id', name: 'lab', component: () => import('./views/LabView.vue'), props: true },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
})

// The real protection is on the server: every API route needs the session cookie.
// This guard only decides which screen to show, and it asks the server (never a local flag).
router.beforeEach(async (to) => {
  const session = useSession()
  if (!session.checked || !session.info?.authenticated) await session.refresh()
  const authed = !!session.info?.authenticated
  if (!authed && !to.meta.open) return { name: 'login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} }
  if (authed && to.name === 'login') return { name: 'home' }
  return true
})

setUnauthenticatedHandler(() => {
  const session = useSession()
  session.markLoggedOut()
  if (router.currentRoute.value.name !== 'login') void router.replace({ name: 'login', query: { next: router.currentRoute.value.fullPath } })
})
