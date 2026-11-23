// Is the screen phone-sized? Mirrors Tailwind's `sm` breakpoint (640 px), so a component can
// render its phone variant with v-if and keep every test id unique in the page.

import { readonly, ref, type Ref } from 'vue'

export const PHONE_QUERY = '(max-width: 639.98px)'

const phone = ref(false)
let watching = false

export function usePhone(): Readonly<Ref<boolean>> {
  if (!watching && typeof matchMedia === 'function') {
    watching = true
    const query = matchMedia(PHONE_QUERY)
    phone.value = query.matches
    query.addEventListener('change', (e) => (phone.value = e.matches))
  }
  return readonly(phone)
}
