<script setup>
// Indicador de linha expansível (Linha do Tempo, cards de relato): só o
// chevron, sem texto - a linha inteira é clicável. Gira quando aberta.
defineProps({
  aberto: { type: Boolean, default: false }
})
</script>

<template>
  <svg class="chevron-expandir" :class="{ aberto }" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
</template>

<style scoped>
.chevron-expandir {
  width: 22px;
  height: 22px;
  flex: none;
  fill: none;
  stroke: var(--color-text-faint);
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.15s ease, stroke 0.15s ease;
}
.chevron-expandir.aberto {
  transform: rotate(180deg);
}
.row-clickable:hover .chevron-expandir {
  stroke: var(--color-primary);
}
</style>
