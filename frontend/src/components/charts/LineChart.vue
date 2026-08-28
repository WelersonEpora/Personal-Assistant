<script setup>
// Gráfico de linha temporal - Apache ECharts por baixo de EChartsBase.vue.
// Mesmo padrão do AgroMind (components/charts/LineChart.vue lá): só este
// componente conhece a API do ECharts; a montagem da option é pura
// (utils/echarts-option-builder.js), testada em node:test.
import { use } from 'echarts/core'
import { LineChart as EChartsLineChart } from 'echarts/charts'
import { computed, onMounted, ref } from 'vue'
import EChartsBase from './EChartsBase.vue'
import { construirOpcaoLineChart, prepararGrafico } from '../../utils/echarts-option-builder.js'
import { PALETA_SERIES } from '../../utils/avaliacaoFisica.js'

use([EChartsLineChart])

const props = defineProps({
  // [{ nome, cor, casas, pontos: [{ periodo: '2015-06-10', valor: 70 }] }]
  series: { type: Array, default: () => [] },
  // símbolo da unidade (kg, cm, %, kg/m²) - uma só por gráfico
  unidade: { type: String, default: null },
  // faixas horizontais de referência no fundo (ex.: categorias de IMC) -
  // [{ min, max, rotulo, cor }]. Só referência visual, nunca diagnóstico.
  faixasReferencia: { type: Array, default: null },
  // janela mínima sempre visível no eixo Y quando há faixas - { min, max }.
  janelaReferencia: { type: Object, default: null },
  altura: { type: String, default: '240px' }
})

const raiz = ref(null)

// Tokens de tema lidos 1x do DOM (o app não tem toggle claro/escuro; os
// fallbacks cobrem o instante antes do onMounted).
const cores = ref({
  texto: '#12141c',
  textoMuted: '#6b7280',
  borda: '#e5e7eb',
  fundo: '#ffffff',
  crosshair: '#d1d5db'
})
onMounted(() => {
  if (!raiz.value) return
  const estilo = getComputedStyle(raiz.value)
  const ler = (nomeVar, fallback) => estilo.getPropertyValue(nomeVar).trim() || fallback
  cores.value = {
    texto: ler('--color-text', cores.value.texto),
    textoMuted: ler('--color-text-secondary', cores.value.textoMuted),
    borda: ler('--color-border', cores.value.borda),
    fundo: ler('--color-surface', cores.value.fundo),
    crosshair: ler('--color-border-strong', cores.value.crosshair)
  }
})

const temDadoSuficiente = computed(() => prepararGrafico(props.series).temDadoSuficiente)

const opcao = computed(() =>
  construirOpcaoLineChart({
    series: props.series,
    unidade: props.unidade,
    cores: cores.value,
    paleta: PALETA_SERIES,
    faixas: props.faixasReferencia,
    janela: props.janelaReferencia
  })
)
</script>

<template>
  <div ref="raiz" class="line-chart">
    <EChartsBase v-if="temDadoSuficiente" :option="opcao" :altura="altura" />
    <p v-else class="line-chart__vazio">Histórico insuficiente para exibir o gráfico.</p>
  </div>
</template>

<style scoped>
.line-chart {
  width: 100%;
}
.line-chart__vazio {
  margin: 0;
  padding: 2rem 0;
  text-align: center;
  color: var(--color-text-secondary, #6b7280);
  font-size: 0.9rem;
}
</style>
