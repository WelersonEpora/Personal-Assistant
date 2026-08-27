<script setup>
import { ref, computed, onMounted } from 'vue'
import alunosService from '../../services/alunos.service.js'
import avaliacoesMensaisService from '../../services/avaliacoesMensais.service.js'
import analisesSobDemandaService from '../../services/analisesSobDemanda.service.js'
import avaliacoesPersonalService from '../../services/avaliacoesPersonal.service.js'
import { formatarDataHora } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'
import AcompanhamentoDetalhe from '../../components/AcompanhamentoDetalhe.vue'

const props = defineProps({ id: { type: String, required: true } })
const { toasts, showToast } = useToasts()

const aluno = ref(null)
const carregando = ref(true)

// Fontes do feed (docs/adr/0015): avaliação mensal (IA), análise sob demanda
// (IA) e avaliação do personal (sem IA) - tudo numa linha do tempo só.
const avaliacoes = ref([])
const analises = ref([])
const avaliacoesPersonal = ref([])
const disponibilidade = ref(null)

const expandidoId = ref(null)
const filtro = ref('tudo')

// Ações
const gerando = ref(false)
const solicitandoAnalise = ref(false)
const mensagemInsuficiente = ref('')
const editorAberto = ref(false)
const textoEditor = ref('')
const editandoId = ref(null)
const salvandoAvaliacao = ref(false)

// Mês de referência default: o mês anterior (o que o job mensal fecha).
function mesAnterior() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const mesSelecionado = ref(mesAnterior())

const STATUS_META = {
  gerada: { label: 'Gerada', badge: 'badge-success' },
  dados_insuficientes: { label: 'Dados insuficientes', badge: 'badge-neutral' },
  falha: { label: 'Falha ao gerar', badge: 'badge-danger' }
}
function statusMeta(status) {
  return STATUS_META[status] || { label: status, badge: 'badge-neutral' }
}

function rotuloMes(anoMes) {
  if (!anoMes) return ''
  const [ano, mes] = String(anoMes).split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(mes) - 1]}/${ano}`
}

function dataCurta(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
}

const jaExisteMesSelecionado = computed(() => avaliacoes.value.some((a) => a.ano_mes === mesSelecionado.value))

// ---- Feed unificado ---------------------------------------------------------
const CHIPS = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'mensal', label: 'Mensal' },
  { id: 'sob_demanda', label: 'Sob demanda' },
  { id: 'personal', label: 'Minhas' }
]

const feed = computed(() => {
  const itens = []
  for (const av of avaliacoes.value) {
    itens.push({ tipo: 'mensal', chave: `m:${av.ano_mes}`, ordem: `${av.periodo_fim}T23:59:59`, dados: av })
  }
  for (const an of analises.value) {
    itens.push({ tipo: 'sob_demanda', chave: `s:${an.id}`, ordem: an.solicitada_em, dados: an })
  }
  for (const p of avaliacoesPersonal.value) {
    itens.push({ tipo: 'personal', chave: `p:${p.id}`, ordem: p.created_at, dados: p })
  }
  return itens.sort((a, b) => String(b.ordem).localeCompare(String(a.ordem)))
})

function contagem(id) {
  return id === 'tudo' ? feed.value.length : feed.value.filter((it) => it.tipo === id).length
}

const feedFiltrado = computed(() =>
  filtro.value === 'tudo' ? feed.value : feed.value.filter((it) => it.tipo === filtro.value)
)

function subLinha(item) {
  if (item.tipo === 'mensal') {
    const av = item.dados
    const partes = [`${av.relatos_considerados} relato(s)`]
    const n = (av.avaliacoes_personal_consideradas || []).length
    if (n) partes.push(`${n} avaliação(ões) sua(s)`)
    partes.push(`gerada ${dataCurta(av.gerada_em)}`)
    if (av.origem === 'manual') partes.push('manual')
    return partes.join(' · ')
  }
  const an = item.dados
  const partes = [`${an.relatos_considerados} relato(s) recente(s)`]
  if ((an.baseada_em_avaliacao_personal_ids || []).length) partes.push('inclui avaliação sua')
  return partes.join(' · ')
}

function alternarExpandido(chave) {
  expandidoId.value = expandidoId.value === chave ? null : chave
}

// ---- Carregamento ----------------------------------------------------------
async function carregarAnalises() {
  const { analises: lista, disponibilidade: disp } = await analisesSobDemandaService.listar(props.id)
  analises.value = lista
  disponibilidade.value = disp
}

async function carregarAvaliacoesPersonal() {
  avaliacoesPersonal.value = await avaliacoesPersonalService.listar(props.id)
}

async function carregar() {
  carregando.value = true
  try {
    const [dadosAluno, lista] = await Promise.all([
      alunosService.obter(props.id),
      avaliacoesMensaisService.listarPorAluno(props.id),
      carregarAnalises(),
      carregarAvaliacoesPersonal()
    ])
    aluno.value = dadosAluno
    avaliacoes.value = lista
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

// ---- Ações: avaliação mensal ---------------------------------------------
async function gerar() {
  gerando.value = true
  try {
    const avaliacao = await avaliacoesMensaisService.gerar(props.id, mesSelecionado.value)
    await avaliacoesMensaisService.listarPorAluno(props.id).then((l) => (avaliacoes.value = l))
    filtro.value = 'tudo'
    expandidoId.value = `m:${avaliacao.ano_mes}`
    if (avaliacao.status === 'gerada') {
      showToast(`Avaliação de ${rotuloMes(avaliacao.ano_mes)} gerada.`, 'success')
    } else if (avaliacao.status === 'dados_insuficientes') {
      showToast(`Menos de 5 relatos confirmados em ${rotuloMes(avaliacao.ano_mes)} — registrado como dados insuficientes.`, 'neutral')
    } else {
      showToast('A IA não conseguiu gerar a avaliação. Tente novamente em instantes.', 'warning')
    }
  } catch (err) {
    showToast(err?.response?.data?.error?.message || 'Não foi possível gerar a avaliação.', 'warning')
  } finally {
    gerando.value = false
  }
}

// ---- Ações: análise sob demanda ----------------------------------------
async function solicitarAnalise() {
  solicitandoAnalise.value = true
  mensagemInsuficiente.value = ''
  try {
    const resultado = await analisesSobDemandaService.solicitar(props.id)
    if (resultado.persistida === false) {
      mensagemInsuficiente.value = resultado.mensagem
      showToast('Dados insuficientes para uma análise — nada foi consumido.', 'neutral')
      return
    }
    await carregarAnalises()
    filtro.value = 'tudo'
    expandidoId.value = `s:${resultado.id}`
    if (resultado.status === 'gerada') {
      showToast('Análise gerada.', 'success')
    } else {
      showToast('A IA não conseguiu gerar a análise. Tente novamente em instantes.', 'warning')
    }
  } catch (err) {
    showToast(err?.response?.data?.error?.message || 'Não foi possível solicitar a análise.', 'warning')
    await carregarAnalises()
  } finally {
    solicitandoAnalise.value = false
  }
}

// ---- Ações: avaliação do personal ------------------------------------------
function abrirEditorNova() {
  editandoId.value = null
  textoEditor.value = ''
  editorAberto.value = true
}

function abrirEditorEdicao(avaliacao) {
  editandoId.value = avaliacao.id
  textoEditor.value = avaliacao.texto
  editorAberto.value = true
}

function fecharEditor() {
  editorAberto.value = false
  textoEditor.value = ''
  editandoId.value = null
}

async function salvarAvaliacaoPersonal() {
  const texto = textoEditor.value.trim()
  if (!texto) return
  salvandoAvaliacao.value = true
  try {
    if (editandoId.value) {
      await avaliacoesPersonalService.atualizar(props.id, editandoId.value, texto)
      showToast('Avaliação atualizada.', 'success')
    } else {
      await avaliacoesPersonalService.criar(props.id, texto)
      showToast('Avaliação registrada — entra no próximo acompanhamento mensal.', 'success')
    }
    fecharEditor()
    filtro.value = 'tudo'
    await carregarAvaliacoesPersonal()
  } catch (err) {
    showToast(err?.response?.data?.error?.message || 'Não foi possível salvar a avaliação.', 'warning')
  } finally {
    salvandoAvaliacao.value = false
  }
}

async function excluirAvaliacaoPersonal(avaliacao) {
  if (!window.confirm('Excluir esta avaliação? Ela não será mais considerada nos próximos ciclos de IA.')) return
  try {
    await avaliacoesPersonalService.excluir(props.id, avaliacao.id)
    showToast('Avaliação excluída.', 'neutral')
    await carregarAvaliacoesPersonal()
  } catch (_err) {
    showToast('Não foi possível excluir a avaliação.', 'warning')
  }
}
</script>

<template>
  <div v-if="aluno">
    <router-link class="detail-back" :to="{ name: 'admin-aluno-detalhe', params: { id: props.id } }">← Voltar para {{ aluno.nome }}</router-link>

    <div class="view-header">
      <div>
        <h1>Acompanhamento</h1>
        <p>{{ aluno.nome }}</p>
      </div>
    </div>

    <div class="exercise-obs" style="margin-bottom: 18px;">
      As análises da IA aqui são <strong>apoio técnico</strong> à sua avaliação — não são dado oficial e não
      substituem sua decisão. Você também pode registrar a <strong>sua própria avaliação</strong> (sem IA): ela
      entra no contexto dos próximos ciclos de IA, junto dos relatos.
    </div>

    <!-- ===== Barra de ações ===== -->
    <div class="card card-pad" style="margin-bottom: 18px;">
      <div class="acomp-acoes-linha">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="solicitandoAnalise || (disponibilidade && !disponibilidade.disponivel_agora)"
          @click="solicitarAnalise"
        >
          {{ solicitandoAnalise ? 'Analisando…' : '🔎 Solicitar análise' }}
        </button>
        <button type="button" class="btn btn-secondary" @click="abrirEditorNova">✍️ Escrever avaliação</button>
        <input v-model="mesSelecionado" type="month" aria-label="Mês de referência" class="acomp-mes" />
        <button type="button" class="btn btn-secondary" :disabled="gerando" @click="gerar">
          {{ gerando ? 'Gerando…' : jaExisteMesSelecionado ? '🗓️ Regenerar mês' : '🗓️ Gerar mês' }}
        </button>
      </div>

      <div class="acomp-acoes-info">
        <span v-if="disponibilidade && !disponibilidade.disponivel_agora" class="list-row-sub">
          Próxima análise sob demanda em <strong>{{ formatarDataHora(disponibilidade.proxima_disponivel_em) }}</strong>.
        </span>
        <span class="list-row-sub">A avaliação mensal também roda automaticamente no início de cada mês (mín. 5 relatos confirmados).</span>
      </div>

      <div v-if="mensagemInsuficiente" class="exercise-obs" style="margin-top: 12px;">{{ mensagemInsuficiente }}</div>

      <div v-if="editorAberto" style="margin-top: 14px;">
        <textarea
          v-model="textoEditor"
          rows="5"
          maxlength="5000"
          aria-label="Avaliação do personal"
          placeholder="Ex.: Aluno vem mais consistente, dormindo melhor. Ainda evita treino de pernas — vou insistir na próxima ficha."
          style="width: 100%;"
        ></textarea>
        <div style="display: flex; gap: 10px; margin-top: 10px;">
          <button type="button" class="btn btn-primary" :disabled="salvandoAvaliacao || !textoEditor.trim()" @click="salvarAvaliacaoPersonal">
            {{ salvandoAvaliacao ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Salvar avaliação' }}
          </button>
          <button type="button" class="btn btn-ghost" @click="fecharEditor">Cancelar</button>
        </div>
      </div>
    </div>

    <!-- ===== Filtros ===== -->
    <div class="acomp-filtros">
      <button
        v-for="chip in CHIPS"
        :key="chip.id"
        type="button"
        class="acomp-chip"
        :class="{ ativo: filtro === chip.id }"
        @click="filtro = chip.id"
      >
        {{ chip.label }}<span v-if="contagem(chip.id)" class="acomp-chip-num">{{ contagem(chip.id) }}</span>
      </button>
    </div>

    <!-- ===== Feed ===== -->
    <div v-if="carregando" class="card empty-state">Carregando…</div>
    <div v-else-if="!feedFiltrado.length" class="card empty-state">
      <div class="empty-state-icon">📈</div>
      {{ feed.length ? 'Nada neste filtro.' : 'Nada por aqui ainda — a primeira avaliação mensal aparece no fechamento do mês.' }}
    </div>

    <div v-else class="registros-list">
      <div v-for="item in feedFiltrado" :key="item.chave" class="card registro-card">
        <!-- Avaliação mensal / Análise sob demanda -->
        <template v-if="item.tipo !== 'personal'">
          <div class="registro-card-head row-clickable" @click="alternarExpandido(item.chave)">
            <div class="acomp-feed-cab">
              <span class="list-row-title">
                <template v-if="item.tipo === 'mensal'">🗓️ Avaliação mensal — {{ rotuloMes(item.dados.ano_mes) }}</template>
                <template v-else>🔎 Análise sob demanda — {{ dataCurta(item.dados.solicitada_em) }}</template>
              </span>
              <span class="list-row-sub">{{ subLinha(item) }}</span>
            </div>
            <span class="badge" :class="statusMeta(item.dados.status).badge">{{ statusMeta(item.dados.status).label }}</span>
          </div>

          <div v-if="expandidoId === item.chave" class="transcript-box open" @click.stop>
            <AcompanhamentoDetalhe
              :avaliacao="item.tipo === 'mensal' ? item.dados.avaliacao_json : item.dados.analise_json"
              :contexto="item.tipo === 'mensal' ? item.dados.contexto_consolidado_json : null"
              :status="item.dados.status"
              :erro="item.dados.erro"
            />
          </div>
        </template>

        <!-- Avaliação do personal -->
        <template v-else>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
            <div class="acomp-feed-cab">
              <span class="list-row-title">✍️ Sua avaliação — {{ dataCurta(item.dados.created_at) }}</span>
              <span class="list-row-sub">
                {{ item.dados.autor?.nome || 'personal' }}
                <template v-if="item.dados.updated_at && item.dados.updated_at !== item.dados.created_at"> · editada</template>
              </span>
            </div>
            <div style="display: flex; gap: 8px; flex: none;">
              <button type="button" class="btn btn-ghost btn-sm" @click="abrirEditorEdicao(item.dados)">Editar</button>
              <button type="button" class="btn btn-danger-ghost btn-sm" @click="excluirAvaliacaoPersonal(item.dados)">Excluir</button>
            </div>
          </div>
          <p style="font-size: 13.5px; line-height: 1.6; margin-top: 8px; white-space: pre-wrap;">{{ item.dados.texto }}</p>
        </template>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
  <div v-else-if="!carregando" class="empty-state">Aluno não encontrado.</div>
</template>

<style scoped>
.acomp-acoes-linha {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.acomp-mes {
  max-width: 160px;
}
.acomp-acoes-info {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.acomp-filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.acomp-chip {
  font-size: 12.5px;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: var(--radius-full);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
.acomp-chip:hover {
  border-color: var(--color-border-strong);
}
.acomp-chip.ativo {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.acomp-chip-num {
  margin-left: 6px;
  opacity: 0.7;
}
.acomp-feed-cab {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
</style>
