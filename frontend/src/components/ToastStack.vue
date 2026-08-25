<script setup>
defineProps({ toasts: { type: Array, required: true } })
</script>

<template>
  <div class="toast-stack">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="{ 'toast-success': toast.kind === 'success', 'toast-warning': toast.kind === 'warning', 'toast-out': toast.saindo }"
    >
      {{ toast.message }}
    </div>
  </div>
</template>
