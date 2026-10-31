<script setup>
import { computed } from 'vue'
import { resumoReferencia } from '../../utils/referenciasAvaliacaoFisica.js'

// docs/adr/0031 - etiqueta da classificação ao lado do valor. O title é o
// atalho do desktop; a explicação completa abre na linha (ReferenciaMedida).
const props = defineProps({
  classificacao: { type: Object, default: null },
  casas: { type: Number, default: 1 },
  // 'selo' (etiqueta com texto) | 'ponto' (só a bolinha, tabela comparativa)
  forma: { type: String, default: 'selo' },
  // mostra o "i" dentro do selo: indica que o toque abre a explicação
  expansivel: { type: Boolean, default: false }
})

const visivel = computed(() => !!props.classificacao && !props.classificacao.semReferencia)
const titulo = computed(() => resumoReferencia(props.classificacao, props.casas))
</script>

<template>
  <span
    v-if="visivel && forma === 'ponto'"
    class="ref-ponto"
    :class="`ref-${classificacao.tom}`"
    :title="titulo"
    :aria-label="classificacao.rotulo"
  />
  <span v-else-if="visivel" class="badge ref-selo" :class="[`badge-${classificacao.tom}`, { expansivel }]" :title="titulo">
    {{ classificacao.rotulo }}<span v-if="expansivel" class="ref-i" aria-hidden="true">i</span>
  </span>
</template>

<style scoped>
.ref-selo { white-space: nowrap; }
.ref-selo.expansivel { cursor: pointer; gap: 5px; }
.ref-i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  font-size: 9px;
  font-weight: 800;
  font-style: italic;
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1;
  opacity: 0.85;
}
.ref-ponto {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 6px;
  vertical-align: middle;
  background: currentColor;
}
.ref-success { color: var(--color-success); }
.ref-warning { color: var(--color-warning); }
.ref-danger { color: var(--color-danger); }
.ref-info { color: var(--color-info); }
</style>
