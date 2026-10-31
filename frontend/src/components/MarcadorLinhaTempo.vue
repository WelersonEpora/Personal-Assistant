<script setup>
// Marcador de um evento na Linha do Tempo do aluno: o círculo sobre o trilho
// vertical, com a cor (classes .tipo-* de tokens.css) e o ícone do tipo.
// `previsto`: o Acompanhamento Mensal que ainda vai ser gerado (tracejado).
defineProps({
  tipo: { type: String, required: true }, // mensal | relato | fisica | analise | observacao
  previsto: { type: Boolean, default: false }
})
</script>

<template>
  <span class="marcador" :class="['tipo-' + tipo, { previsto }]" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <template v-if="tipo === 'mensal'"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></template>
      <path v-else-if="tipo === 'relato'" d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      <path v-else-if="tipo === 'fisica'" d="M3 12h4l3-7 4 14 3-7h4" />
      <path v-else-if="tipo === 'analise'" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path v-else d="M4 20h4L19 9l-4-4L4 16v4z" />
    </svg>
  </span>
</template>

<style scoped>
.marcador {
  position: relative;
  z-index: 1;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 4px var(--color-surface);
  box-sizing: border-box;
}
/* O Acompanhamento Mensal é a entrega do mês: marcador cheio. */
.marcador.tipo-mensal {
  background: var(--color-primary);
  color: #fff;
}
.marcador.previsto {
  background: var(--color-surface);
  color: var(--color-primary);
  border: 2px dashed #a5b4fc;
}
svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (max-width: 760px) {
  .marcador {
    width: 26px;
    height: 26px;
  }
  svg {
    width: 13px;
    height: 13px;
  }
}
</style>
