<script setup>
import { ref, computed } from 'vue'
import {
  rotuloMesAno,
  METRICAS_COMPARACAO_HEADLINE,
  PERIODOS_COMPARACAO,
  filtrarPorPeriodo
} from '../../utils/avaliacaoFisica.js'
import AvaliacaoFisicaGraficos from './AvaliacaoFisicaGraficos.vue'

const props = defineProps({
  avaliacoes: { type: Array, required: true },
  metricas: { type: Array, required: true }
})

const verTodas = ref(false)
const periodo = ref('tudo')

const metricaPorCodigo = computed(() => Object.fromEntries(props.metricas.map((m) => [m.codigo, m])))

// avaliações no período selecionado - a tabela E os gráficos usam esta lista
const noPeriodo = computed(() => filtrarPorPeriodo(props.avaliacoes, periodo.value))

// colunas = avaliações por data crescente (desempate pela data cheia)
const colunas = computed(() =>
  [...noPeriodo.value].sort((a, b) => String(a.data).localeCompare(String(b.data)))
)

// valor da medida `principal` de uma métrica numa avaliação
function principal(av, codigo) {
  return (av.medidas || []).find((m) => m.metrica_codigo === codigo && m.principal)
}
function celula(av, codigo) {
  const m = principal(av, codigo)
  if (!m) return '—'
  const casas = metricaPorCodigo.value[codigo]?.casas_decimais ?? 1
  const n = Number(m.valor)
  return Number.isFinite(n) ? n.toFixed(casas) : m.valor
}

function codigosPrincipais(lista) {
  const presentes = new Set()
  for (const av of lista) {
    for (const m of av.medidas || []) if (m.principal) presentes.add(m.metrica_codigo)
  }
  return presentes
}

// linhas = métricas que aparecem como principal em ≥1 avaliação, ordem do catálogo
const linhas = computed(() => {
  const codigos = [...codigosPrincipais(colunas.value)].filter((c) =>
    verTodas.value ? true : METRICAS_COMPARACAO_HEADLINE.includes(c)
  )
  return codigos
    .map((c) => metricaPorCodigo.value[c])
    .filter(Boolean)
    .sort((a, b) => a.ordem - b.ordem)
})

const temEscondidas = computed(() =>
  [...codigosPrincipais(colunas.value)].some((c) => !METRICAS_COMPARACAO_HEADLINE.includes(c))
)

const avisoVazio = computed(() =>
  props.avaliacoes.length < 2
    ? 'Adicione ao menos 2 avaliações para comparar.'
    : 'Menos de 2 avaliações neste período — escolha um intervalo maior.'
)
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Comparar avaliações</h1>
        <p>{{ colunas.length }} avaliações</p>
      </div>
    </div>

    <div class="af-filtros">
      <div class="af-periodo">
        <button
          v-for="p in PERIODOS_COMPARACAO"
          :key="p.chave"
          type="button"
          class="filter-tab"
          :class="{ active: periodo === p.chave }"
          @click="periodo = p.chave"
        >
          {{ p.rotulo }}
        </button>
      </div>
      <label v-if="temEscondidas" class="af-toggle">
        <input v-model="verTodas" type="checkbox" /> ver todas as métricas
      </label>
    </div>

    <div v-if="colunas.length < 2" class="card empty-state">{{ avisoVazio }}</div>

    <template v-else>
      <div class="card card-pad af-scroll">
        <table class="af-comparar">
          <thead>
            <tr>
              <th class="af-col-metrica">Indicador</th>
              <th v-for="av in colunas" :key="av.id">{{ rotuloMesAno(av.data) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="metrica in linhas" :key="metrica.codigo">
              <th class="af-col-metrica">
                {{ metrica.rotulo }} <span class="af-unidade">({{ metrica.unidade }})</span>
              </th>
              <td v-for="av in colunas" :key="av.id" class="af-num">{{ celula(av, metrica.codigo) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="af-graficos-titulo">Evolução</h2>
      <AvaliacaoFisicaGraficos :avaliacoes="colunas" :metricas="metricas" />
    </template>
  </div>
</template>

<style scoped>
.af-filtros {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 14px;
}
.af-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; }
.af-periodo { display: flex; gap: 6px; flex-wrap: wrap; }
.af-scroll { overflow-x: auto; margin-bottom: 26px; }
.af-comparar { border-collapse: collapse; font-size: 14px; min-width: 100%; }
.af-comparar th,
.af-comparar td { padding: 8px 14px; border-bottom: 1px solid var(--color-border, #e5e5e5); white-space: nowrap; }
.af-comparar thead th { text-align: right; font-weight: 700; color: var(--color-text-faint, #666); }
.af-comparar tbody tr:last-child th,
.af-comparar tbody tr:last-child td { border-bottom: none; }
.af-col-metrica {
  position: sticky;
  left: 0;
  background: var(--color-surface, #fff);
  text-align: left !important;
  font-weight: 600;
}
.af-num { text-align: right; font-variant-numeric: tabular-nums; }
.af-unidade { font-weight: 400; color: var(--color-text-faint, #888); font-size: 12px; }
.af-graficos-titulo { font-size: 16px; font-weight: 700; margin: 0 0 14px; }
</style>
