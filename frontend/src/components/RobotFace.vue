<script setup lang="ts">
defineProps<{ mood?: 'happy' | 'oops' | 'think' }>()
</script>

<template>
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="29" y="2" width="6" height="10" rx="3" fill="#b4bde8" />
    <circle cx="32" cy="4" r="4" fill="#ff4ccd" />
    <rect x="6" y="12" width="52" height="44" rx="14" fill="#ffd23f" />
    <rect x="12" y="18" width="40" height="32" rx="9" fill="#101a3a" />
    <template v-if="mood === 'oops'">
      <path d="M19 27l7 7m0-7l-7 7M38 27l7 7m0-7l-7 7" stroke="#34ccf1" stroke-width="3.5" stroke-linecap="round" />
      <path d="M24 44q8-6 16 0" stroke="#34ccf1" stroke-width="3.5" fill="none" stroke-linecap="round" />
    </template>
    <template v-else-if="mood === 'think'">
      <rect x="18" y="28" width="9" height="4" rx="2" fill="#34ccf1" />
      <rect x="37" y="28" width="9" height="4" rx="2" fill="#34ccf1" />
      <rect x="26" y="40" width="12" height="4" rx="2" fill="#34ccf1" />
    </template>
    <template v-else>
      <circle cx="23" cy="30" r="5" fill="#34ccf1" />
      <circle cx="41" cy="30" r="5" fill="#34ccf1" />
      <path d="M23 40q9 8 18 0" stroke="#34ccf1" stroke-width="3.5" fill="none" stroke-linecap="round" />
    </template>
  </svg>
</template>
