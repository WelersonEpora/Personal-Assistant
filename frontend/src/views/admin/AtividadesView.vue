<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import atividadesService from '../../services/atividades.service.js'
import alunosService from '../../services/alunos.service.js'
import { rotuloMesAno, PALETA_SERIES } from '../../utils/avaliacaoFisica.js'
import { formatarDataAtendimento } from '../../utils/registroStatus.js'
import CampoData from '../../components/CampoData.vue'
import BarChart from '../../components/charts/BarChart.vue'

// docs/adr/0020 - tela de Atendimentos: o que foi registrado no período.
// Somente leitura, uma requisição por combinação de filtros (GET /atividades).
// Eixo temporal sempre `data_atendimento` (docs/adr/0019).

const COR_ATENDIMENTO = PALETA_SERIES[0]
const COR_AVALIACAO = PALETA_SERIES[1]
const TOP_RANKING = 8
const NOMES_MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function isoHoje() {
  return new Date().toISOString().slice(0, 10)
}
function iso(ano, mes, dia) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Presets de período - todos ancorados em "hoje", resolvidos para { de, ate }.
const PRESETS = [
  { chave: 'mes_atual', rotulo: 'Este mês' },
  { chave: 'mes_passado', rotulo: 'Mês passado' },
  { chave: 'ultimos_30', rotulo: 'Últimos 30 dias' },
  { chave: 'ultimos_90', rotulo: 'Últimos 90 dias' },
  { chave: 'ano_atual', rotulo: 'Este ano' },
  { chave: 'personalizado', rotulo: 'Personalizado' }
]

function resolverPreset(chave, custom) {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = agora.getMonth() + 1
  if (chave === 'mes_atual') return { de: iso(ano, mes, 1), ate: isoHoje() }
  if (chave === 'mes_passado') {
    const y = mes === 1 ? ano - 1 : ano
    const m = mes === 1 ? 12 : mes - 1
    const ultimoDia = new Date(y, m, 0).getDate()
    return { de: iso(y, m, 1), ate: iso(y, m, ultimoDia) }
  }
  if (chave === 'ultimos_30' || chave === 'ultimos_90') {
    const dias = chave === 'ultimos_30' ? 29 : 89
    return { de: new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10), ate: isoHoje() }
  }
  if (chave === 'ano_atual') return { de: iso(ano, 1, 1), ate: isoHoje() }
  return { de: custom.de, ate: custom.ate }
}

const filtros = reactive({
  preset: 'mes_atual',
  custom: { de: '', ate: isoHoje() },
  alunoId: '',
  tipo: '',
  // docs/adr/0020: a tela começa com o número "fechado" (só relatos revisados);
  // o personal desmarca para incluir o backlog ainda em revisão. O endpoint
  // continua com default `false` para outros consumidores.
  somenteConfirmados: true
})

const alunos = ref([])
const dados = ref(null)
const carregando = ref(true)
const erro = ref('')
const verTodosAlunos = ref(false)

const periodoResolvido = computed(() => resolverPreset(filtros.preset, filtros.custom))
const periodoPronto = computed(() => {
  const { de, ate } = periodoResolvido.value
  return Boolean(de && ate && de <= ate)
})

async function carregar() {
  if (!periodoPronto.value) return
  carregando.value = true
  erro.value = ''
  try {
    const { de, ate } = periodoResolvido.value
    dados.value = await atividadesService.obter({
      de,
      ate,
      alunoId: filtros.alunoId || undefined,
      tipo: filtros.tipo || undefined,
      somenteConfirmados: filtros.somenteConfirmados
    })
  } catch (e) {
    erro.value = e?.response?.data?.error?.message || 'Não foi possível carregar o relatório.'
    dados.value = null
  } finally {
    carregando.value = false
  }
}

onMounted(async () => {
  try {
    alunos.value = await alunosService.listar()
  } catch (_e) {
    alunos.value = []
  }
  carregar()
})

watch(
  () => [filtros.preset, filtros.custom.de, filtros.custom.ate, filtros.alunoId, filtros.tipo, filtros.somenteConfirmados],
  () => carregar()
)

// --- rótulo do bucket conforme a granularidade escolhida pelo servidor -----
function rotuloBucket(bucket, granularidade) {
  if (granularidade === 'mes') {
    const [ano, mes] = bucket.split('-')
    return `${NOMES_MES_CURTO[Number(mes) - 1]}/${ano.slice(2)}`
  }
  const [, mes, dia] = bucket.split('-')
  return `${dia}/${mes}`
}

const serieTemporal = computed(() => {
  const d = dados.value
  if (!d) return { categorias: [], series: [] }
  const categorias = d.serie_temporal.map((b) => rotuloBucket(b.bucket, d.periodo.granularidade))
  const series = []
  if (filtros.tipo !== 'avaliacao_fisica') {
    series.push({ nome: 'Atendimentos', cor: COR_ATENDIMENTO, dados: d.serie_temporal.map((b) => b.atendimento) })
  }
  if (filtros.tipo !== 'atendimento') {
    series.push({ nome: 'Avaliações físicas', cor: COR_AVALIACAO, dados: d.serie_temporal.map((b) => b.avaliacao_fisica) })
  }
  return { categorias, series }
})

const GRANULARIDADE_ROTULO = {
  dia: 'por dia',
  semana: 'por semana (início na segunda)',
  mes: 'por mês'
}
const granularidadeRotulo = computed(() => GRANULARIDADE_ROTULO[dados.value?.periodo?.granularidade] || '')

const ranking = computed(() => {
  const lista = dados.value?.por_aluno || []
  const comAtendimento = lista.filter((l) => l.atendimentos > 0)
  const usar = verTodosAlunos.value ? comAtendimento : comAtendimento.slice(0, TOP_RANKING)
  return usar.map((l) => ({ rotulo: l.nome, valor: l.atendimentos }))
})
const rankingTemMais = computed(
  () => (dados.value?.por_aluno || []).filter((l) => l.atendimentos > 0).length > TOP_RANKING
)

const diaSemana = computed(() => {
  const lista = dados.value?.por_dia_semana || []
  const porDow = Object.fromEntries(lista.map((d) => [d.dow, d.atendimentos]))
  const ordem = [1, 2, 3, 4, 5, 6, 0] // seg..dom
  const rotulos = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  return {
    categorias: rotulos,
    series: [{ nome: 'Atendimentos', cor: COR_ATENDIMENTO, dados: ordem.map((dow) => porDow[dow] || 0) }]
  }
})

// --- tabela "Por aluno" com ordenação por clique -------------------------
const ordenacao = reactive({ chave: 'atendimentos', dir: 'desc' })
function ordenarPor(chave) {
  if (ordenacao.chave === chave) {
    ordenacao.dir = ordenacao.dir === 'desc' ? 'asc' : 'desc'
  } else {
    ordenacao.chave = chave
    ordenacao.dir = chave === 'nome' ? 'asc' : 'desc'
  }
}
const porAlunoOrdenado = computed(() => {
  const lista = [...(dados.value?.por_aluno || [])]
  const { chave, dir } = ordenacao
  const fator = dir === 'desc' ? -1 : 1
  return lista.sort((a, b) => {
    let cmp
    if (chave === 'nome') cmp = a.nome.localeCompare(b.nome, 'pt-BR')
    else if (chave === 'ultimo') cmp = String(a.ultimo || '').localeCompare(String(b.ultimo || ''))
    else cmp = (a[chave] || 0) - (b[chave] || 0)
    return cmp * fator || a.nome.localeCompare(b.nome, 'pt-BR')
  })
})
function setaOrd(chave) {
  if (ordenacao.chave !== chave) return ''
  return ordenacao.dir === 'desc' ? ' ↓' : ' ↑'
}

const temResultado = computed(
  () => dados.value && (dados.value.resumo.atendimentos > 0 || dados.value.resumo.avaliacoes_fisicas > 0)
)
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Atendimentos</h1>
        <p>
          Atendimentos e avaliações que você registrou no período. Conta o que foi lançado no
          sistema, não a agenda — pela data do atendimento.
        </p>
      </div>
    </div>

    <!-- Filtros -->
    <div class="card card-pad atv-filtros">
      <div class="filter-tabs">
        <button
          v-for="p in PRESETS"
          :key="p.chave"
          type="button"
          class="filter-tab"
          :class="{ active: filtros.preset === p.chave }"
          @click="filtros.preset = p.chave"
        >
          {{ p.rotulo }}
        </button>
      </div>

      <div class="atv-campos">
        <div v-if="filtros.preset === 'personalizado'" class="field-group">
          <label>De</label>
          <CampoData v-model="filtros.custom.de" :max="filtros.custom.ate || undefined" aria-label="Data inicial" />
        </div>
        <div v-if="filtros.preset === 'personalizado'" class="field-group">
          <label>Até</label>
          <CampoData v-model="filtros.custom.ate" :min="filtros.custom.de || undefined" aria-label="Data final" />
        </div>

        <div class="field-group">
          <label>Aluno</label>
          <select v-model="filtros.alunoId">
            <option value="">Todos os alunos</option>
            <option v-for="a in alunos" :key="a.id" :value="a.id">{{ a.nome }}</option>
          </select>
        </div>

        <div class="field-group">
          <label>Tipo</label>
          <select v-model="filtros.tipo">
            <option value="">Atendimentos e avaliações</option>
            <option value="atendimento">Só atendimentos</option>
            <option value="avaliacao_fisica">Só avaliações físicas</option>
          </select>
        </div>

        <label class="atv-toggle">
          <input v-model="filtros.somenteConfirmados" type="checkbox" />
          somente confirmados
        </label>
      </div>
    </div>

    <div v-if="erro" class="card card-pad atv-erro">{{ erro }}</div>
    <div v-else-if="carregando && !dados" class="empty-state">Carregando…</div>

    <template v-else-if="dados">
      <!-- KPIs -->
      <div class="kpi-grid atv-kpis">
        <div class="card kpi-card">
          <div class="kpi-label">Atendimentos</div>
          <div class="kpi-value">{{ dados.resumo.atendimentos }}</div>
          <div class="kpi-sub">registros lançados</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label">Alunos atendidos</div>
          <div class="kpi-value">{{ dados.resumo.alunos_atendidos }}</div>
          <div class="kpi-sub">distintos no período</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label">Média por aluno</div>
          <div class="kpi-value">{{ dados.resumo.media_por_aluno.toLocaleString('pt-BR') }}</div>
          <div class="kpi-sub">atendimentos ÷ alunos</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label">Dias com atividade</div>
          <div class="kpi-value">{{ dados.resumo.dias_com_atividade }}</div>
          <div class="kpi-sub">dias distintos de atendimento</div>
        </div>
        <div class="card kpi-card">
          <div class="kpi-label">Avaliações físicas</div>
          <div class="kpi-value">{{ dados.resumo.avaliacoes_fisicas }}</div>
          <div class="kpi-sub">trilha separada</div>
        </div>
      </div>

      <div v-if="!temResultado" class="card empty-state">
        Nenhum atendimento registrado nesse período com os filtros atuais.
      </div>

      <template v-else>
        <!-- Gráfico temporal -->
        <div class="card card-pad atv-bloco">
          <div class="atv-bloco-cab">
            <h2>Volume no período</h2>
            <span class="atv-bloco-sub">{{ granularidadeRotulo }}</span>
          </div>
          <BarChart
            modo="vertical"
            :categorias="serieTemporal.categorias"
            :series="serieTemporal.series"
            altura="260px"
          />
        </div>

        <div class="dashboard-grid">
          <div class="card card-pad atv-bloco">
            <div class="atv-bloco-cab">
              <h2>Atendimentos por aluno</h2>
              <button
                v-if="rankingTemMais"
                type="button"
                class="btn btn-ghost btn-sm"
                @click="verTodosAlunos = !verTodosAlunos"
              >
                {{ verTodosAlunos ? 'ver top 8' : 'ver todos' }}
              </button>
            </div>
            <BarChart
              modo="ranking"
              :itens="ranking"
              :cor="COR_ATENDIMENTO"
              :altura="`${Math.max(160, ranking.length * 30)}px`"
              vazio="Nenhum atendimento por aluno no período."
            />
          </div>

          <div class="card card-pad atv-bloco">
            <div class="atv-bloco-cab"><h2>Distribuição por dia da semana</h2></div>
            <BarChart
              modo="vertical"
              :categorias="diaSemana.categorias"
              :series="diaSemana.series"
              :empilhar="false"
              altura="220px"
            />
          </div>
        </div>

        <!-- Tabela por aluno -->
        <h2 class="atv-tabela-titulo">Por aluno</h2>
        <div class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th class="atv-th-clic" @click="ordenarPor('nome')">Aluno{{ setaOrd('nome') }}</th>
                <th class="atv-th-clic atv-num" @click="ordenarPor('atendimentos')">Atend.{{ setaOrd('atendimentos') }}</th>
                <th class="atv-th-clic atv-num" @click="ordenarPor('dias_distintos')">Dias{{ setaOrd('dias_distintos') }}</th>
                <th class="atv-th-clic atv-num" @click="ordenarPor('avaliacoes_fisicas')">Aval. físicas{{ setaOrd('avaliacoes_fisicas') }}</th>
                <th class="atv-num">1º atend.</th>
                <th class="atv-th-clic atv-num" @click="ordenarPor('ultimo')">Último{{ setaOrd('ultimo') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="linha in porAlunoOrdenado" :key="linha.aluno_id">
                <td>
                  <router-link
                    v-if="!linha.aluno_removido"
                    :to="{ name: 'admin-aluno-detalhe', params: { id: linha.aluno_id } }"
                    class="atv-link"
                  >{{ linha.nome }}</router-link>
                  <span v-else class="atv-removido">{{ linha.nome }}</span>
                </td>
                <td class="atv-num">{{ linha.atendimentos }}</td>
                <td class="atv-num">{{ linha.dias_distintos }}</td>
                <td class="atv-num">{{ linha.avaliacoes_fisicas || '—' }}</td>
                <td class="atv-num">{{ linha.primeiro ? formatarDataAtendimento(linha.primeiro) : '—' }}</td>
                <td class="atv-num">{{ linha.ultimo ? formatarDataAtendimento(linha.ultimo) : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Tabela por mês -->
        <h2 class="atv-tabela-titulo">Por mês</h2>
        <div class="card table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="atv-num">Atendimentos</th>
                <th class="atv-num">Alunos distintos</th>
                <th class="atv-num">Avaliações físicas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="linha in dados.por_mes" :key="linha.mes">
                <td>{{ rotuloMesAno(`${linha.mes}-01`) }}</td>
                <td class="atv-num">{{ linha.atendimentos }}</td>
                <td class="atv-num">{{ linha.alunos_distintos }}</td>
                <td class="atv-num">{{ linha.avaliacoes_fisicas }}</td>
              </tr>
              <tr v-if="!dados.por_mes.length">
                <td colspan="4" class="atv-vazio">Nenhum mês com atividade.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.atv-filtros { margin-bottom: 22px; display: flex; flex-direction: column; gap: 14px; }
.atv-campos { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
.atv-campos .field-group { min-width: 180px; }
.atv-campos select { width: 100%; }
.atv-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; white-space: nowrap; padding-bottom: 8px; }

.atv-kpis { grid-template-columns: repeat(5, 1fr); }

.atv-bloco { margin-bottom: 18px; }
.atv-bloco-cab { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
.atv-bloco-cab h2 { font-size: 15px; font-weight: 700; }
.atv-bloco-sub { font-size: 12px; color: var(--color-text-faint); }

.atv-tabela-titulo { font-size: 15px; font-weight: 700; margin: 22px 0 10px; }
.atv-num { text-align: right; white-space: nowrap; }
.atv-th-clic { cursor: pointer; user-select: none; }
.atv-th-clic:hover { color: var(--color-primary); }
.atv-link { color: var(--color-primary-dark); text-decoration: none; }
.atv-link:hover { text-decoration: underline; }
.atv-removido { color: var(--color-text-faint); font-style: italic; }
.atv-vazio { text-align: center; color: var(--color-text-faint); }
.atv-erro { color: var(--color-danger); margin-bottom: 18px; }

@media (max-width: 1100px) {
  .atv-kpis { grid-template-columns: repeat(2, 1fr); }
}
</style>
