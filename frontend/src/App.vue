<script setup>
// Casca minima: cada modo (captura/admin) monta o proprio layout dentro da
// router-view (ver docs/adr/0003-frontend-unico-pwa.md) - App.vue nao
// impoe nenhuma chrome visual compartilhada entre os dois modos.
</script>

<template>
  <router-view />
</template>
