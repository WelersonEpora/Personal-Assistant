<script setup>
import { computed } from 'vue'
import { segmentosRegua, posicaoNaEscala } from '../../utils/referenciasAvaliacaoFisica.js'

// docs/adr/0031 - régua de faixas com o marcador do valor. Usada no painel da
// medida (ReferenciaMedida) e no retrato da avaliação (RetratoAvaliacao).
const props = defineProps({
  classificacao: { type: Object, required: true }, // com faixas/escala (não semReferencia)
  valor: { type: [Number, String], required: true },
  casas: { type: Number, default: 1 },
  rotulo: { type: String, default: '' }
})

const segmentos = computed(() => segmentosRegua(props.classificacao.faixas, props.classificacao.escala))
const marcador = computed(() => posicaoNaEscala(props.valor, props.classificacao.escala))

function fmt(n) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: props.casas, maximumFractionDigits: props.casas })
}
</script>

<template>
  <div class="ref-regua" role="img" :aria-label="`${rotulo ? rotulo + ': ' : ''}${fmt(valor)} — ${classificacao.rotulo}`">
    <div class="ref-trilho">
      <div
        v-for="s in segmentos"
        :key="s.rotulo"
        class="ref-seg"
        :class="`ref-${s.tom}`"
        :style="{ left: `${s.de}%`, width: `${s.ate - s.de}%` }"
        :title="s.rotulo"
      />
      <div class="ref-marcador" :style="{ left: `${marcador}%` }" />
    </div>
    <div class="ref-cortes">
      <span
        v-for="s in segmentos.filter((x) => x.corte != null)"
        :key="s.corte"
        class="ref-corte"
        :style="{ left: `${s.ate}%` }"
      >{{ fmt(s.corte) }}</span>
    </div>
  </div>
</template>

<style scoped>
.ref-regua { padding-top: 6px; }
.ref-trilho { position: relative; height: 8px; border-radius: 4px; overflow: visible; }
.ref-seg { position: absolute; top: 0; height: 100%; background: currentColor; opacity: 0.35; }
.ref-seg:first-child { border-radius: 4px 0 0 4px; }
.ref-seg:nth-last-child(2) { border-radius: 0 4px 4px 0; }
.ref-marcador {
  position: absolute;
  top: -5px;
  width: 4px;
  height: 18px;
  margin-left: -2px;
  border-radius: 2px;
  background: var(--color-text, #111);
  box-shadow: 0 0 0 2px var(--color-surface, #fff);
}
.ref-cortes { position: relative; height: 16px; margin-top: 4px; }
.ref-corte {
  position: absolute;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--color-text-faint);
  font-variant-numeric: tabular-nums;
}
.ref-success { color: var(--color-success); }
.ref-warning { color: var(--color-warning); }
.ref-danger { color: var(--color-danger); }
.ref-info { color: var(--color-info); }
</style>
