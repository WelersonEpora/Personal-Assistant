<script setup>
// Gráfico de barras - Apache ECharts por baixo de EChartsBase.vue. Mesmo
// padrão de LineChart.vue: só este componente conhece a API do ECharts; a
// montagem da option é pura (utils/echarts-bar-option-builder.js), testada em
// node:test. Usado pela tela de Atendimentos (docs/adr/0020).
//
//   modo="vertical" -> série(s) temporal(is), empilháveis (`categorias` + `series`)
//   modo="ranking"  -> barras horizontais ordenadas (`itens: [{ rotulo, valor }]`)
import { use } from 'echarts/core'
import { BarChart as EChartsBarChart } from 'echarts/charts'
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import EChartsBase from './EChartsBase.vue'
import {
  construirOpcaoBarras,
  construirOpcaoBarrasHorizontais,
  temAlgumValor
} from '../../utils/echarts-bar-option-builder.js'
import { PALETA_SERIES } from '../../utils/avaliacaoFisica.js'

use([EChartsBarChart])

const props = defineProps({
  modo: { type: String, default: 'vertical' }, // 'vertical' | 'ranking'
  categorias: { type: Array, default: () => [] },
  series: { type: Array, default: () => [] }, // [{ nome, cor, dados: number[] }]
  empilhar: { type: Boolean, default: true },
  itens: { type: Array, default: () => [] }, // ranking: [{ rotulo, valor }]
  cor: { type: String, default: '#2a78d6' },
  altura: { type: String, default: '240px' },
  vazio: { type: String, default: 'Sem atividade no período.' }
})

const raiz = ref(null)

// Layout compacto no mobile: legenda/rótulos menores, nomes do ranking menos
// truncados. matchMedia acompanha rotação/redimensionamento (o autoresize do
// ECharts só redesenha; a option é recomputada por esta flag).
const compacto = ref(false)
let mql = null
function sincronizarCompacto(e) {
  compacto.value = e.matches
}

// Tokens de tema lidos 1x do DOM (o app não tem toggle claro/escuro; os
// fallbacks cobrem o instante antes do onMounted). Mesmo esquema de LineChart.
const cores = ref({
  texto: '#12141c',
  textoMuted: '#6b7280',
  borda: '#e5e7eb',
  fundo: '#ffffff'
})
onMounted(() => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    mql = window.matchMedia('(max-width: 760px)')
    compacto.value = mql.matches
    mql.addEventListener('change', sincronizarCompacto)
  }
  if (!raiz.value) return
  const estilo = getComputedStyle(raiz.value)
  const ler = (nomeVar, fallback) => estilo.getPropertyValue(nomeVar).trim() || fallback
  cores.value = {
    texto: ler('--color-text', cores.value.texto),
    textoMuted: ler('--color-text-secondary', cores.value.textoMuted),
    borda: ler('--color-border', cores.value.borda),
    fundo: ler('--color-surface', cores.value.fundo)
  }
})

onBeforeUnmount(() => {
  if (mql) mql.removeEventListener('change', sincronizarCompacto)
})

const temDado = computed(() =>
  props.modo === 'ranking'
    ? props.itens.some((i) => Number(i.valor) > 0)
    : temAlgumValor(props.series)
)

const opcao = computed(() =>
  props.modo === 'ranking'
    ? construirOpcaoBarrasHorizontais({
        itens: props.itens,
        cor: props.cor,
        cores: cores.value,
        compacto: compacto.value
      })
    : construirOpcaoBarras({
        categorias: props.categorias,
        series: props.series,
        cores: cores.value,
        paleta: PALETA_SERIES,
        empilhar: props.empilhar,
        compacto: compacto.value
      })
)
</script>

<template>
  <div ref="raiz" class="bar-chart">
    <EChartsBase v-if="temDado" :option="opcao" :altura="altura" />
    <p v-else class="bar-chart__vazio">{{ vazio }}</p>
  </div>
</template>

<style scoped>
.bar-chart {
  width: 100%;
}
.bar-chart__vazio {
  margin: 0;
  padding: 2rem 0;
  text-align: center;
  color: var(--color-text-secondary, #6b7280);
  font-size: 0.9rem;
}
</style>
