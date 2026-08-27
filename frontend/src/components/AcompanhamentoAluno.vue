<script setup>
import { ref, computed, onMounted } from 'vue'
import avaliacoesMensaisService from '../services/avaliacoesMensais.service.js'
import analisesSobDemandaService from '../services/analisesSobDemanda.service.js'
import avaliacoesPersonalService from '../services/avaliacoesPersonal.service.js'
import registrosService from '../services/registros.service.js'
import { formatarDataHora } from '../utils/registroStatus.js'
import { useToasts } from '../composables/useToasts.js'
import ToastStack from './ToastStack.vue'
import AcompanhamentoDetalhe from './AcompanhamentoDetalhe.vue'
import RegistroCard from './RegistroCard.vue'

const props = defineProps({ id: { type: String, required: true } })
const { toasts, showToast } = useToasts()

const carregando = ref(true)

// Fontes do acompanhamento (docs/adr/0015): relato (evidência), avaliação
// mensal (IA), análise sob demanda (IA) e avaliação do personal (sem IA).
// Tudo agrupado por mês - um "card do mês", mês mais recente primeiro (ver
// computed `meses`). O card do mês corrente é o hub de ações.
const registros = ref([])
const avaliacoes = ref([])
const analises = ref([])
const avaliacoesPersonal = ref([])
const disponibilidade = ref(null)

const expandidoId = ref(null)
const filtro = ref('tudo')

// Ações
const gerandoMes = ref(null) // "YYYY-MM" do mês cuja avaliação está sendo (re)gerada
const solicitandoAnalise = ref(false)
const mensagemInsuficiente = ref('')
const novaAberta = ref(false) // editor de nova avaliação, no card do mês corrente
const editandoId = ref(null) // id da avaliação em edição inline (na linha dela)
const textoEditor = ref('')
const salvandoAvaliacao = ref(false)

// "YYYY-MM" do mês atual (offset 0) ou de um mês relativo a ele.
function mesRef(offset = 0) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const mesCorrente = computed(() => mesRef(0))
function ehMesCorrente(m) {
  return m.anoMes === mesCorrente.value
}

// "YYYY-MM" (horário local) de uma data ISO - usado para jogar cada item no
// card do mês em que aconteceu.
function mesDe(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const STATUS_META = {
  gerada: { label: 'Gerada', badge: 'badge-success' },
  dados_insuficientes: { label: 'Dados insuficientes', badge: 'badge-neutral' },
  falha: { label: 'Falha ao gerar', badge: 'badge-danger' }
}
function statusMeta(status) {
  return STATUS_META[status] || { label: status, badge: 'badge-neutral' }
}

const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const NOMES_MES_LONGO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
function rotuloMes(anoMes) {
  if (!anoMes) return ''
  const [ano, mes] = String(anoMes).split('-')
  return `${NOMES_MES[Number(mes) - 1]}/${ano}`
}
function rotuloMesLongo(anoMes) {
  const [ano, mes] = String(anoMes).split('-')
  return `${NOMES_MES_LONGO[Number(mes) - 1]} ${ano}`
}

function dataCurta(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
}

// ---- Agrupamento por mês --------------------------------------------------
const CHIPS = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'relato', label: 'Relatos' },
  { id: 'mensal', label: 'Mensal' },
  { id: 'sob_demanda', label: 'Sob demanda' },
  { id: 'personal', label: 'Minhas' }
]

// Relato confirmado cai no mês da confirmação (regra da ADR-0015); em
// andamento, no mês em que foi criado.
function mesDoRegistro(r) {
  const quando = r.status === 'confirmado' ? (r.validacao?.confirmado_em || r.created_at) : r.created_at
  return { anoMes: mesDe(quando), ordem: quando }
}

const meses = computed(() => {
  const mapa = new Map()
  const mesAtual = mesCorrente.value
  const bucket = (anoMes) => {
    if (!mapa.has(anoMes)) mapa.set(anoMes, { anoMes, mensal: null, itens: [] })
    return mapa.get(anoMes)
  }

  // O mês atual sempre tem card (âncora do topo, "em andamento").
  bucket(mesAtual)

  for (const r of registros.value) {
    const { anoMes, ordem } = mesDoRegistro(r)
    bucket(anoMes).itens.push({ tipo: 'relato', chave: `r:${r.id}`, ordem, dados: r })
  }
  for (const av of avaliacoes.value) bucket(av.ano_mes).mensal = av
  for (const an of analises.value) {
    bucket(mesDe(an.solicitada_em)).itens.push({ tipo: 'sob_demanda', chave: `s:${an.id}`, ordem: an.solicitada_em, dados: an })
  }
  for (const p of avaliacoesPersonal.value) {
    bucket(mesDe(p.created_at)).itens.push({ tipo: 'personal', chave: `p:${p.id}`, ordem: p.created_at, dados: p })
  }

  return [...mapa.values()]
    .filter((m) => m.anoMes === mesAtual || m.mensal || m.itens.length)
    .sort((a, b) => b.anoMes.localeCompare(a.anoMes))
    .map((m) => ({
      ...m,
      emAndamento: m.anoMes >= mesAtual,
      itens: [...m.itens].sort((x, y) => String(y.ordem).localeCompare(String(x.ordem)))
    }))
})

const mesesFiltrados = computed(() => {
  if (filtro.value === 'tudo') return meses.value
  return meses.value.filter((m) => {
    if (ehMesCorrente(m)) return true // hub de ações sempre visível
    if (filtro.value === 'mensal') return !!m.mensal
    return m.itens.some((i) => i.tipo === filtro.value)
  })
})

function contagem(id) {
  if (id === 'relato') return registros.value.length
  if (id === 'mensal') return avaliacoes.value.length
  if (id === 'sob_demanda') return analises.value.length
  if (id === 'personal') return avaliacoesPersonal.value.length
  return registros.value.length + avaliacoes.value.length + analises.value.length + avaliacoesPersonal.value.length
}

function mostrarMensal(m) {
  return !!m.mensal && (filtro.value === 'tudo' || filtro.value === 'mensal')
}
function itensVisiveis(m) {
  if (filtro.value === 'tudo') return m.itens
  if (filtro.value === 'mensal') return []
  return m.itens.filter((i) => i.tipo === filtro.value)
}

// Gerar/regerar só faz sentido para o mês atual, o anterior (candidatos do job)
// ou qualquer mês que já tenha avaliação (regeneração).
function podeGerar(m) {
  return m.mensal != null || m.anoMes >= mesRef(-1)
}
function rotuloBotaoGerar(m) {
  if (gerandoMes.value === m.anoMes) return 'Gerando…'
  return m.mensal ? '✨ Regerar mês' : '✨ Gerar mensal agora'
}

function subLinhaMensal(av) {
  if (!av) return ''
  const partes = [`${av.relatos_considerados} relato(s)`]
  const n = (av.avaliacoes_personal_consideradas || []).length
  if (n) partes.push(`${n} avaliação(ões) sua(s)`)
  if (av.origem === 'manual') partes.push('gerada manualmente')
  return partes.join(' · ')
}
function subLinhaAnalise(an) {
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

async function carregarRegistros() {
  const todos = await registrosService.listar({})
  registros.value = todos.filter((r) => r.aluno_id === props.id)
}

async function carregar() {
  carregando.value = true
  try {
    const [lista] = await Promise.all([
      avaliacoesMensaisService.listarPorAluno(props.id),
      carregarRegistros(),
      carregarAnalises(),
      carregarAvaliacoesPersonal()
    ])
    avaliacoes.value = lista
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

// ---- Ações: avaliação mensal ---------------------------------------------
async function gerar(anoMes) {
  gerandoMes.value = anoMes
  mensagemInsuficiente.value = ''
  try {
    const resultado = await avaliacoesMensaisService.gerar(props.id, anoMes)
    // Geração manual com dados insuficientes não vira registro (docs/adr/0015):
    // mostra o motivo, não mexe no feed, e o botão fica livre pra tentar de novo.
    if (resultado.persistida === false) {
      mensagemInsuficiente.value = resultado.mensagem
      showToast('Relatos insuficientes para gerar a avaliação — nada foi alterado.', 'neutral')
      return
    }
    avaliacoes.value = await avaliacoesMensaisService.listarPorAluno(props.id)
    filtro.value = 'tudo'
    expandidoId.value = `m:${resultado.ano_mes}`
    if (resultado.status === 'gerada') {
      showToast(`Avaliação de ${rotuloMes(resultado.ano_mes)} gerada.`, 'success')
    } else {
      showToast('A IA não conseguiu gerar a avaliação. Tente novamente em instantes.', 'warning')
    }
  } catch (err) {
    showToast(err?.response?.data?.error?.message || 'Não foi possível gerar a avaliação.', 'warning')
  } finally {
    gerandoMes.value = null
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
  novaAberta.value = true
}

function abrirEditorEdicao(avaliacao) {
  novaAberta.value = false
  editandoId.value = avaliacao.id
  textoEditor.value = avaliacao.texto
}

function fecharEditor() {
  novaAberta.value = false
  editandoId.value = null
  textoEditor.value = ''
}

async function salvarAvaliacaoPersonal() {
  const texto = textoEditor.value.trim()
  if (!texto) return
  const editando = !!editandoId.value
  salvandoAvaliacao.value = true
  try {
    if (editando) {
      await avaliacoesPersonalService.atualizar(props.id, editandoId.value, texto)
      showToast('Avaliação atualizada.', 'success')
    } else {
      await avaliacoesPersonalService.criar(props.id, texto)
      showToast('Avaliação registrada — entra no próximo acompanhamento mensal.', 'success')
    }
    fecharEditor()
    if (!editando) filtro.value = 'tudo'
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
  <div>
    <div class="exercise-obs" style="margin-bottom: 18px;">
      <span class="acomp-obs-item">
        As análises da IA são apoio técnico e não substituem sua avaliação. Você também pode registrar suas
        próprias observações, que serão consideradas nas próximas análises junto aos relatos.
      </span>
      <span class="acomp-obs-item">
        A avaliação mensal é gerada automaticamente no início de cada mês, desde que haja pelo menos 5 relatos confirmados.
      </span>
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

    <!-- ===== Cards do mês ===== -->
    <div v-if="carregando" class="card empty-state">Carregando…</div>
    <div v-else-if="!mesesFiltrados.length" class="card empty-state">
      <div class="empty-state-icon">📈</div>
      Nada neste filtro.
    </div>

    <div v-else class="acomp-meses">
      <section v-for="m in mesesFiltrados" :key="m.anoMes" class="card acomp-mes-card">
        <header class="acomp-mes-head">
          <div class="acomp-mes-head-topo">
            <div class="acomp-mes-titulo">
              <h2>{{ rotuloMesLongo(m.anoMes) }}</h2>
              <span v-if="m.mensal" class="badge" :class="statusMeta(m.mensal.status).badge">{{ statusMeta(m.mensal.status).label }}</span>
              <span v-else-if="m.emAndamento" class="badge badge-neutral">Mês em andamento</span>
              <span v-else class="badge badge-neutral">Sem avaliação mensal</span>
            </div>

            <button
              v-if="!ehMesCorrente(m) && podeGerar(m)"
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="gerandoMes === m.anoMes"
              @click="gerar(m.anoMes)"
            >
              {{ rotuloBotaoGerar(m) }}
            </button>

            <!-- Hub de ações: só no card do mês corrente, alinhado à direita -->
            <div v-if="ehMesCorrente(m)" class="acomp-acoes-grupo">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="solicitandoAnalise || (disponibilidade && !disponibilidade.disponivel_agora)"
                @click="solicitarAnalise"
              >
                {{ solicitandoAnalise ? 'Analisando…' : '✨ Solicitar análise intermediária de IA' }}
              </button>
              <button type="button" class="btn btn-primary btn-sm" @click="abrirEditorNova">✍️ Escrever avaliação</button>
              <button
                v-if="podeGerar(m)"
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="gerandoMes === m.anoMes"
                @click="gerar(m.anoMes)"
              >
                {{ rotuloBotaoGerar(m) }}
              </button>
            </div>
          </div>

          <!-- Info / aviso: só no card do mês corrente -->
          <template v-if="ehMesCorrente(m)">
            <div v-if="disponibilidade && !disponibilidade.disponivel_agora" class="acomp-acoes-info">
              <span class="list-row-sub">
                Próxima análise sob demanda em <strong>{{ formatarDataHora(disponibilidade.proxima_disponivel_em) }}</strong>.
              </span>
            </div>

            <div v-if="mensagemInsuficiente" class="exercise-obs acomp-mes-aviso">{{ mensagemInsuficiente }}</div>
          </template>
        </header>

        <!-- Editor de nova avaliação (card do mês corrente) -->
        <div v-if="ehMesCorrente(m) && novaAberta" class="acomp-linha acomp-editor">
          <textarea
            v-model="textoEditor"
            rows="5"
            maxlength="5000"
            aria-label="Nova avaliação do personal"
            placeholder="Ex.: Aluno vem mais consistente, dormindo melhor. Ainda evita treino de pernas — vou insistir na próxima ficha."
          ></textarea>
          <div class="acomp-editor-acoes">
            <button type="button" class="btn btn-primary btn-sm" :disabled="salvandoAvaliacao || !textoEditor.trim()" @click="salvarAvaliacaoPersonal">
              {{ salvandoAvaliacao ? 'Salvando…' : 'Salvar avaliação' }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="fecharEditor">Cancelar</button>
          </div>
        </div>

        <!-- Avaliação mensal -->
        <div v-if="mostrarMensal(m)" class="acomp-linha">
          <div class="registro-card-head row-clickable" @click="alternarExpandido('m:' + m.anoMes)">
            <div class="acomp-feed-cab">
              <span class="list-row-title">🗓️ Avaliação mensal — {{ formatarDataHora(m.mensal.gerada_em) }}</span>
              <span class="list-row-sub">{{ subLinhaMensal(m.mensal) }}</span>
            </div>
            <span class="acomp-chevron">{{ expandidoId === 'm:' + m.anoMes ? '▲' : '▼' }}</span>
          </div>
          <div v-if="expandidoId === 'm:' + m.anoMes" class="acomp-detalhe-box" @click.stop>
            <AcompanhamentoDetalhe
              :avaliacao="m.mensal.avaliacao_json"
              :contexto="m.mensal.contexto_consolidado_json"
              :status="m.mensal.status"
              :erro="m.mensal.erro"
            />
          </div>
        </div>

        <!-- Relato / análise sob demanda / avaliação do personal -->
        <div v-for="item in itensVisiveis(m)" :key="item.chave" class="acomp-linha">
          <RegistroCard
            v-if="item.tipo === 'relato'"
            :registro="item.dados"
            :aberto="expandidoId === item.chave"
            @toggle="alternarExpandido(item.chave)"
          />

          <template v-else-if="item.tipo === 'sob_demanda'">
            <div class="registro-card-head row-clickable" @click="alternarExpandido(item.chave)">
              <div class="acomp-feed-cab">
                <span class="list-row-title">✨ Análise sob demanda — {{ dataCurta(item.dados.solicitada_em) }}</span>
                <span class="list-row-sub">{{ subLinhaAnalise(item.dados) }}</span>
              </div>
              <span class="badge" :class="statusMeta(item.dados.status).badge">{{ statusMeta(item.dados.status).label }}</span>
            </div>
            <div v-if="expandidoId === item.chave" class="acomp-detalhe-box" @click.stop>
              <AcompanhamentoDetalhe :avaliacao="item.dados.analise_json" :status="item.dados.status" :erro="item.dados.erro" />
            </div>
          </template>

          <template v-else>
            <div class="acomp-pessoal-head">
              <div class="acomp-feed-cab">
                <span class="list-row-title">✍️ Sua avaliação — {{ formatarDataHora(item.dados.created_at) }}</span>
                <span class="list-row-sub">
                  {{ item.dados.autor?.nome || 'personal' }}
                  <template v-if="item.dados.updated_at && item.dados.updated_at !== item.dados.created_at"> · editada</template>
                </span>
              </div>
              <div v-if="editandoId !== item.dados.id" class="acomp-pessoal-acoes">
                <button type="button" class="btn btn-ghost btn-sm" @click="abrirEditorEdicao(item.dados)">Editar</button>
                <button type="button" class="btn btn-danger-ghost btn-sm" @click="excluirAvaliacaoPersonal(item.dados)">Excluir</button>
              </div>
            </div>

            <div v-if="editandoId === item.dados.id" class="acomp-editor" style="margin-top: 10px;">
              <textarea v-model="textoEditor" rows="5" maxlength="5000" aria-label="Editar avaliação do personal"></textarea>
              <div class="acomp-editor-acoes">
                <button type="button" class="btn btn-primary btn-sm" :disabled="salvandoAvaliacao || !textoEditor.trim()" @click="salvarAvaliacaoPersonal">
                  {{ salvandoAvaliacao ? 'Salvando…' : 'Salvar alterações' }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" @click="fecharEditor">Cancelar</button>
              </div>
            </div>
            <p v-else class="acomp-pessoal-texto">{{ item.dados.texto }}</p>
          </template>
        </div>

        <p v-if="filtro === 'tudo' && !m.mensal && !m.itens.length && !(ehMesCorrente(m) && novaAberta)" class="list-row-sub acomp-mes-vazio">
          {{ m.emAndamento ? 'Nada registrado neste mês ainda.' : 'Avaliação mensal ainda não gerada para este mês.' }}
        </p>
      </section>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.acomp-acoes-grupo {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.acomp-acoes-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.acomp-mes-aviso {
  margin: 0;
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
.acomp-obs-item {
  display: block;
}
.acomp-obs-item + .acomp-obs-item {
  margin-top: 8px;
}
.acomp-obs-item::before {
  content: '● ';
}

/* Cards do mês */
.acomp-meses {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.acomp-mes-card {
  padding: 0;
  overflow: hidden;
}
.acomp-mes-head {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-alt);
}
.acomp-mes-head-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 12px;
  flex-wrap: wrap;
}
.acomp-mes-head-topo .acomp-acoes-grupo {
  margin-left: auto;
  justify-content: flex-end;
}
.acomp-mes-titulo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.acomp-mes-titulo h2 {
  font-size: 15px;
  margin: 0;
}
.acomp-linha {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}
.acomp-linha:last-child {
  border-bottom: none;
}
.acomp-mes-vazio {
  padding: 14px 16px;
}
.acomp-chevron {
  color: var(--color-text-faint);
  font-size: 11px;
  flex: none;
}
/* Detalhe da avaliação da IA: texto normal (não é transcrição - não usa o
   cinza/itálico do .transcript-box). */
.acomp-detalhe-box {
  margin-top: 10px;
  padding: 14px 16px;
  background: var(--color-surface-alt);
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}
.acomp-pessoal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.acomp-pessoal-acoes {
  display: flex;
  gap: 8px;
  flex: none;
}
.acomp-pessoal-texto {
  font-size: 13.5px;
  line-height: 1.6;
  margin-top: 8px;
  white-space: pre-wrap;
}
.acomp-editor textarea {
  width: 100%;
}
.acomp-editor-acoes {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
</style>
