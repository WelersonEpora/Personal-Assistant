<script setup>
import { ref, computed } from 'vue'
import LineChart from '../charts/LineChart.vue'
import { PALETA_SERIES, CORES_COMPOSICAO, FAIXAS_IMC, JANELA_IMC } from '../../utils/avaliacaoFisica.js'

const props = defineProps({
  avaliacoes: { type: Array, required: true },
  metricas: { type: Array, required: true }
})

const MAX_PERIMETROS = 8

const metricaPorCodigo = computed(() => Object.fromEntries(props.metricas.map((m) => [m.codigo, m])))

const avaliacoesOrdenadas = computed(() =>
  [...props.avaliacoes].sort((a, b) => String(a.data).localeCompare(String(b.data)))
)

// pontos da medida `principal` de uma métrica ao longo das avaliações
function pontos(codigo) {
  const out = []
  for (const av of avaliacoesOrdenadas.value) {
    const m = (av.medidas || []).find((x) => x.metrica_codigo === codigo && x.principal)
    if (!m) continue
    const v = Number(m.valor)
    if (Number.isFinite(v)) out.push({ periodo: String(av.data).slice(0, 10), valor: v })
  }
  return out
}

// rótulos enxutos para a legenda/tooltip (o catálogo tem alguns longos)
const ROTULO_CURTO = {
  peso: 'Peso',
  massa_gorda: 'Massa gorda',
  massa_magra: 'Massa magra',
  percentual_gordura: '% de gordura'
}

function serie(codigo, cor, rotulo) {
  const meta = metricaPorCodigo.value[codigo]
  return {
    nome: rotulo || ROTULO_CURTO[codigo] || meta?.rotulo || codigo,
    cor,
    casas: meta?.casas_decimais ?? 1,
    pontos: pontos(codigo)
  }
}

// --- composição corporal (kg) ---
const seriesComposicao = computed(() =>
  [
    serie('peso', CORES_COMPOSICAO.peso),
    serie('massa_gorda', CORES_COMPOSICAO.massa_gorda),
    serie('massa_magra', CORES_COMPOSICAO.massa_magra)
  ].filter((s) => s.pontos.length)
)

// --- indicadores (dois gráficos separados) ---
const serieImc = computed(() => [serie('imc', PALETA_SERIES[0])])
const seriePctGordura = computed(() => [serie('percentual_gordura', PALETA_SERIES[1])])
const temImc = computed(() => serieImc.value[0].pontos.length > 0)
const temPctGordura = computed(() => seriePctGordura.value[0].pontos.length > 0)

// --- perímetros (cm, seleção) ---
const perimetrosCatalogo = computed(() =>
  props.metricas.filter((m) => m.categoria === 'perimetro').sort((a, b) => a.ordem - b.ordem)
)
// cor por métrica: atribuída na 1ª vez que a métrica é selecionada e nunca
// mais trocada (desligar outra série não repinta esta). Sem colisão até 8.
const coresAtribuidas = ref({})
function garantirCor(codigo) {
  if (coresAtribuidas.value[codigo]) return
  const usadas = new Set(Object.values(coresAtribuidas.value))
  coresAtribuidas.value[codigo] = PALETA_SERIES.find((c) => !usadas.has(c)) || PALETA_SERIES[0]
}
function corDe(codigo) {
  return coresAtribuidas.value[codigo] || PALETA_SERIES[0]
}
function rotuloPerimetro(rotulo) {
  const curto = String(rotulo).replace(/^Perímetro d[aeo] /, '')
  return curto.charAt(0).toUpperCase() + curto.slice(1)
}

const perimetrosDisponiveis = computed(() => {
  const presentes = new Set()
  for (const av of props.avaliacoes) {
    for (const m of av.medidas || []) {
      if (m.principal && metricaPorCodigo.value[m.metrica_codigo]?.categoria === 'perimetro') {
        presentes.add(m.metrica_codigo)
      }
    }
  }
  return perimetrosCatalogo.value.filter((m) => presentes.has(m.codigo))
})

const perimetrosSelecionados = ref(
  ['perimetro_cintura', 'perimetro_quadril'].filter((c) =>
    props.avaliacoes.some((av) => (av.medidas || []).some((m) => m.metrica_codigo === c && m.principal))
  )
)
perimetrosSelecionados.value.forEach(garantirCor)

function togglePerimetro(codigo) {
  const i = perimetrosSelecionados.value.indexOf(codigo)
  if (i >= 0) {
    perimetrosSelecionados.value.splice(i, 1)
  } else if (perimetrosSelecionados.value.length < MAX_PERIMETROS) {
    garantirCor(codigo)
    perimetrosSelecionados.value.push(codigo)
  }
}
const noLimite = computed(() => perimetrosSelecionados.value.length >= MAX_PERIMETROS)
const seriesPerimetros = computed(() =>
  perimetrosSelecionados.value
    .map((c) => serie(c, corDe(c), rotuloPerimetro(metricaPorCodigo.value[c]?.rotulo || c)))
    .filter((s) => s.pontos.length)
)
</script>

<template>
  <div>
    <div class="card card-pad grafico-card">
      <div class="grafico-titulo">Composição corporal</div>
      <LineChart v-if="seriesComposicao.length" :series="seriesComposicao" unidade="kg" altura="240px" />
      <p v-else class="list-row-sub">Sem peso / composição registrados no período.</p>
    </div>

    <div class="card card-pad grafico-card">
      <div class="grafico-titulo">Indicadores corporais</div>
      <div v-if="temImc || temPctGordura">
        <div v-if="temImc" class="grafico-sub">
          <div class="grafico-subtitulo">IMC <span class="grafico-un">(kg/m²)</span></div>
          <LineChart
            :series="serieImc"
            unidade="kg/m²"
            :faixas-referencia="FAIXAS_IMC"
            :janela-referencia="JANELA_IMC"
            altura="180px"
          />
          <p class="grafico-nota">Faixas de referência (classificação convencional de IMC) — apenas referência visual, não diagnóstico.</p>
        </div>
        <div v-if="temPctGordura" class="grafico-sub">
          <div class="grafico-subtitulo">% de gordura</div>
          <LineChart :series="seriePctGordura" unidade="%" altura="180px" />
        </div>
      </div>
      <p v-else class="list-row-sub">Sem IMC / % de gordura no período.</p>
    </div>

    <div class="card card-pad grafico-card">
      <div class="grafico-titulo">Perímetros <span class="grafico-un">(cm)</span></div>
      <div v-if="perimetrosDisponiveis.length" class="grafico-chips">
        <label
          v-for="m in perimetrosDisponiveis"
          :key="m.codigo"
          :class="{ 'chip-off': !perimetrosSelecionados.includes(m.codigo) && noLimite }"
        >
          <input
            type="checkbox"
            :checked="perimetrosSelecionados.includes(m.codigo)"
            :disabled="!perimetrosSelecionados.includes(m.codigo) && noLimite"
            @change="togglePerimetro(m.codigo)"
          />
          {{ rotuloPerimetro(m.rotulo) }}
        </label>
      </div>
      <p v-if="noLimite" class="list-row-sub grafico-limite">Máximo de {{ MAX_PERIMETROS }} métricas no gráfico.</p>
      <LineChart v-if="seriesPerimetros.length" :series="seriesPerimetros" unidade="cm" altura="240px" />
      <p v-else class="list-row-sub">Selecione ao menos um perímetro.</p>
    </div>
  </div>
</template>

<style scoped>
.grafico-card { margin-bottom: 16px; }
.grafico-titulo { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
.grafico-un { font-weight: 400; color: var(--color-text-faint, #9ca3af); font-size: 12px; }
.grafico-sub { margin-bottom: 18px; }
.grafico-sub:last-child { margin-bottom: 0; }
.grafico-subtitulo { font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #6b7280); margin-bottom: 4px; }
.grafico-chips { display: flex; flex-wrap: wrap; gap: 10px 14px; margin-bottom: 10px; }
.grafico-chips label { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; }
.grafico-chips label.chip-off { opacity: 0.4; }
.grafico-limite { margin: -4px 0 10px; }
.grafico-nota { margin: 4px 0 0; font-size: 11px; color: var(--color-text-faint, #9ca3af); }
</style>
