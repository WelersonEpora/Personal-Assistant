<script setup>
import { ref, computed, onMounted } from 'vue'
import avaliacoesMensaisService from '../services/avaliacoesMensais.service.js'
import analisesSobDemandaService from '../services/analisesSobDemanda.service.js'
import avaliacoesPersonalService from '../services/avaliacoesPersonal.service.js'
import registrosService from '../services/registros.service.js'
import { formatarDataHora, formatarDataAtendimento } from '../utils/registroStatus.js'
import { revisaoDesatualizada } from '../utils/avaliacaoMensalCompartilhada.js'
import { useToasts } from '../composables/useToasts.js'
import { useConfirm } from '../composables/useConfirm.js'
import ToastStack from './ToastStack.vue'
import AcompanhamentoDetalhe from './AcompanhamentoDetalhe.vue'
import RegistroCard from './RegistroCard.vue'

const props = defineProps({ id: { type: String, required: true } })
const { toasts, showToast } = useToasts()
const { confirmar, avisar } = useConfirm()

const carregando = ref(true)

// Fontes do acompanhamento (docs/adr/0015): relato (evidência), avaliação
// mensal (IA), análise sob demanda (IA) e avaliação do personal (sem IA).
// Tudo agrupado por mês - um "card do mês", mês mais recente primeiro (ver
// computed `meses`). O card do mês corrente é o hub de ações.
// Dentro do card, as leituras (mensal / análise / avaliação do personal) vêm
// primeiro e a mais relevante ganha destaque; os relatos confirmados ficam
// recolhidos num grupo - o volume deles não pode esconder a avaliação do mês.
const registros = ref([])
const avaliacoes = ref([])
const analises = ref([])
const avaliacoesPersonal = ref([])
const disponibilidade = ref(null)

const expandidoId = ref(null)
const gruposAbertos = ref(new Set()) // "rel:YYYY-MM" / "an:YYYY-MM" - grupos recolhíveis do card do mês
const filtro = ref('tudo')
const mostrarAjuda = ref(false)

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
function nomeMes(anoMes) {
  return NOMES_MES_LONGO[Number(String(anoMes).split('-')[1]) - 1].toLowerCase()
}
function rotuloMesLongo(anoMes) {
  const [ano, mes] = String(anoMes).split('-')
  return `${NOMES_MES_LONGO[Number(mes) - 1]} ${ano}`
}

// ---- Agrupamento por mês --------------------------------------------------
const CHIPS = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'relato', label: 'Relatos' },
  { id: 'mensal', label: 'Mensal' },
  { id: 'sob_demanda', label: 'Intermediárias' },
  { id: 'personal', label: 'Minhas' }
]

// Relato confirmado cai no mês da confirmação (regra da ADR-0015); em
// andamento, no mês em que foi criado.
function mesDoRegistro(r) {
  return mesDe(r.status === 'confirmado' ? (r.validacao?.confirmado_em || r.created_at) : r.created_at)
}

// Dentro do mês, relatos por data do atendimento (ADR-0019) - é a data que a
// linha mostra; ordenar pela confirmação deixava a sequência embaralhada.
function chaveRelato(r) {
  return `${r.data_atendimento || ''}|${r.validacao?.confirmado_em || r.created_at}`
}
const desc = (campo) => (x, y) => String(campo(y)).localeCompare(String(campo(x)))

const meses = computed(() => {
  const mapa = new Map()
  const mesAtual = mesCorrente.value
  const bucket = (anoMes) => {
    if (!mapa.has(anoMes)) mapa.set(anoMes, { anoMes, mensal: null, relatos: [], analises: [], pessoais: [] })
    return mapa.get(anoMes)
  }

  // O mês atual sempre tem card (âncora do topo, "em andamento").
  bucket(mesAtual)

  for (const r of registros.value) bucket(mesDoRegistro(r)).relatos.push(r)
  for (const av of avaliacoes.value) bucket(av.ano_mes).mensal = av
  for (const an of analises.value) bucket(mesDe(an.solicitada_em)).analises.push(an)
  for (const p of avaliacoesPersonal.value) bucket(mesDe(p.created_at)).pessoais.push(p)

  return [...mapa.values()]
    .filter((m) => m.anoMes === mesAtual || m.mensal || m.relatos.length || m.analises.length || m.pessoais.length)
    .sort((a, b) => b.anoMes.localeCompare(a.anoMes))
    .map((m) => {
      const relatos = [...m.relatos].sort(desc(chaveRelato))
      return {
        anoMes: m.anoMes,
        mensal: m.mensal,
        emAndamento: m.anoMes >= mesAtual,
        // Pendentes pedem ação (revisar) - ficam sempre à vista, fora do grupo.
        relatosPendentes: relatos.filter((r) => r.status !== 'confirmado'),
        relatosConfirmados: relatos.filter((r) => r.status === 'confirmado'),
        analises: [...m.analises].sort(desc((a) => a.solicitada_em)),
        pessoais: [...m.pessoais].sort(desc((p) => p.created_at))
      }
    })
})

const mesesFiltrados = computed(() => {
  if (filtro.value === 'tudo') return meses.value
  return meses.value.filter((m) => {
    if (ehMesCorrente(m)) return true // hub de ações sempre visível
    if (filtro.value === 'mensal') return !!m.mensal
    if (filtro.value === 'relato') return m.relatosPendentes.length + m.relatosConfirmados.length > 0
    if (filtro.value === 'sob_demanda') return m.analises.length > 0
    return m.pessoais.length > 0
  })
})

function mostra(tipo) {
  return filtro.value === 'tudo' || filtro.value === tipo
}

// Leitura em destaque do mês: a avaliação mensal, quando existe; senão (mês em
// andamento) a análise intermediária mais recente. As demais análises ficam
// num grupo recolhido.
function analiseDestaque(m) {
  return m.mensal ? null : m.analises[0] || null
}
function analisesSecundarias(m) {
  return analiseDestaque(m) ? m.analises.slice(1) : m.analises
}
function rotuloAnalisesSecundarias(m) {
  const n = analisesSecundarias(m).length
  if (analiseDestaque(m)) return `+ ${n} análise(s) intermediária(s) anterior(es)`
  return `${n} análise(s) intermediária(s) neste mês`
}

// Grupo recolhível: o filtro do próprio tipo abre o grupo à força.
function grupoForcado(tipo) {
  return filtro.value === tipo
}
function grupoAberto(chave, tipo) {
  return grupoForcado(tipo) || gruposAbertos.value.has(chave)
}
function alternarGrupo(chave) {
  if (gruposAbertos.value.has(chave)) gruposAbertos.value.delete(chave)
  else gruposAbertos.value.add(chave)
}

function periodoRelatos(relatos) {
  const datas = relatos.map((r) => r.data_atendimento).filter(Boolean).sort()
  if (!datas.length) return ''
  const ini = formatarDataAtendimento(datas[0]).slice(0, 5)
  const fim = formatarDataAtendimento(datas[datas.length - 1]).slice(0, 5)
  return ini === fim ? `atendimento em ${ini}` : `atendimentos de ${ini} a ${fim}`
}

function mesVazio(m) {
  return !m.mensal && !m.analises.length && !m.pessoais.length &&
    !m.relatosPendentes.length && !m.relatosConfirmados.length
}

function contagem(id) {
  if (id === 'relato') return registros.value.length
  if (id === 'mensal') return avaliacoes.value.length
  if (id === 'sob_demanda') return analises.value.length
  if (id === 'personal') return avaliacoesPersonal.value.length
  return registros.value.length + avaliacoes.value.length + analises.value.length + avaliacoesPersonal.value.length
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

function formatarDataCurta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Estado do compartilhamento da avaliação mensal (docs/adr/0023).
function estadoCompartilhamento(av) {
  if (!av || av.status !== 'gerada') return null
  if (!av.revisao) return { rotulo: 'Ainda não compartilhada', stale: false }
  if (revisaoDesatualizada(av, av.revisao)) {
    return { rotulo: 'Revisão desatualizada — a avaliação mudou depois', stale: true }
  }
  return { rotulo: `Compartilhada em ${formatarDataCurta(av.revisao.compartilhada_em)}`, stale: false }
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
      await avisar({
        titulo: 'A IA não conseguiu gerar a avaliação',
        mensagem:
          'O provedor de IA não respondeu agora. Isso costuma ser temporário — tente de novo em alguns minutos.' +
          (resultado.erro ? `\n\nDetalhe técnico:\n${resultado.erro}` : '')
      })
    }
  } catch (err) {
    await avisar({
      titulo: 'Não foi possível gerar a avaliação',
      mensagem:
        'Houve um erro ao falar com o servidor. Verifique a conexão e tente de novo em alguns minutos.' +
        (err?.response?.data?.error?.message ? `\n\nDetalhe técnico:\n${err.response.data.error.message}` : '')
    })
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
    // A nova costuma virar o destaque do mês; se o mês já tem mensal, ela cai
    // no grupo recolhido - abre o grupo para a análise aparecer.
    gruposAbertos.value.add(`an:${mesCorrente.value}`)
    expandidoId.value = `s:${resultado.id}`
    if (resultado.status === 'gerada') {
      showToast('Análise gerada.', 'success')
    } else {
      // Falha da IA: a linha foi criada com o erro. Modal que fica até o
      // usuário fechar (o toast some rápido demais para uma mensagem dessas).
      await avisar({
        titulo: 'A IA não conseguiu gerar a análise',
        mensagem:
          'O provedor de IA não respondeu agora. Isso costuma ser temporário — tente de novo em alguns minutos.' +
          (resultado.erro ? `\n\nDetalhe técnico:\n${resultado.erro}` : '')
      })
    }
  } catch (err) {
    const detalhe = err?.response?.data?.error?.message
    await avisar({
      titulo: 'Não foi possível solicitar a análise',
      mensagem:
        'Houve um erro ao falar com o servidor. Verifique a conexão e tente de novo em alguns minutos.' +
        (detalhe ? `\n\nDetalhe técnico:\n${detalhe}` : '')
    })
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
  const ok = await confirmar({
    titulo: 'Excluir esta avaliação?',
    mensagem: 'Ela não será mais considerada nos próximos ciclos de IA.',
    perigo: true
  })
  if (!ok) return
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
    <div class="acomp-cabecalho">
      <h2 class="acomp-titulo">Acompanhamento</h2>
      <button type="button" class="acomp-ajuda-toggle" :aria-expanded="mostrarAjuda" @click="mostrarAjuda = !mostrarAjuda">
        ⓘ Como funciona
      </button>

      <!-- Filtros: discretos e à direita, para não parecerem uma 2ª barra de abas -->
      <div class="acomp-filtros">
        <span class="acomp-filtros-rotulo">Mostrar:</span>
        <button
          v-for="chip in CHIPS"
          :key="chip.id"
          type="button"
          class="acomp-chip"
          :class="{ ativo: filtro === chip.id }"
          :aria-pressed="filtro === chip.id"
          @click="filtro = chip.id"
        >
          {{ chip.label }}<span v-if="contagem(chip.id)" class="acomp-chip-num">{{ contagem(chip.id) }}</span>
        </button>
      </div>
    </div>
    <div v-if="mostrarAjuda" class="exercise-obs acomp-ajuda-corpo">
      <span class="acomp-obs-item">
        As análises da IA são apoio técnico e não substituem sua avaliação. Você também pode registrar suas
        próprias observações, que serão consideradas nas próximas análises junto aos relatos.
      </span>
      <span class="acomp-obs-item">
        A avaliação mensal é gerada automaticamente no início de cada mês, desde que haja pelo menos 3 relatos confirmados.
      </span>
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

        <!-- Destaque: avaliação mensal -->
        <div v-if="m.mensal && mostra('mensal')" class="acomp-linha acomp-destaque">
          <div class="registro-card-head row-clickable" @click="alternarExpandido('m:' + m.anoMes)">
            <div class="acomp-feed-cab">
              <span class="list-row-title acomp-destaque-titulo">
                🗓️ Avaliação mensal de {{ nomeMes(m.anoMes) }}<span class="acomp-linha-data"> · gerada {{ formatarDataHora(m.mensal.gerada_em) }}</span>
              </span>
              <span class="list-row-sub">
                {{ subLinhaMensal(m.mensal) }}
                <template v-if="estadoCompartilhamento(m.mensal)">
                  · <span :class="{ 'acomp-compartilhar-stale': estadoCompartilhamento(m.mensal).stale }">{{ estadoCompartilhamento(m.mensal).rotulo }}</span>
                </template>
              </span>
            </div>
            <span class="acomp-abrir">
              {{ expandidoId === 'm:' + m.anoMes ? 'Fechar' : 'Abrir' }}
              <span class="acomp-chevron" :class="{ aberto: expandidoId === 'm:' + m.anoMes }" aria-hidden="true">▾</span>
            </span>
          </div>
          <div v-if="expandidoId === 'm:' + m.anoMes" class="acomp-detalhe-box" @click.stop>
            <!-- Compartilhar com o aluno (docs/adr/0023) - só quando a IA gerou. -->
            <div v-if="estadoCompartilhamento(m.mensal)" class="acomp-compartilhar">
              <router-link
                class="btn btn-primary btn-sm"
                :to="{ name: 'compartilhar-avaliacao-mensal', params: { id: props.id, anoMes: m.anoMes } }"
              >
                📄 {{ m.mensal.revisao ? 'Revisar / gerar PDF' : 'Compartilhar com o aluno' }}
              </router-link>
              <span class="list-row-sub" :class="{ 'acomp-compartilhar-stale': estadoCompartilhamento(m.mensal).stale }">
                {{ estadoCompartilhamento(m.mensal).rotulo }}
              </span>
            </div>

            <AcompanhamentoDetalhe
              :avaliacao="m.mensal.avaliacao_json"
              :contexto="m.mensal.contexto_consolidado_json"
              :status="m.mensal.status"
              :erro="m.mensal.erro"
            />
          </div>
        </div>

        <!-- Análises intermediárias: a mais recente em destaque (mês sem mensal),
             as demais num grupo recolhido -->
        <template v-if="mostra('sob_demanda')">
          <div v-if="analiseDestaque(m)" class="acomp-linha acomp-destaque">
            <div class="registro-card-head row-clickable" @click="alternarExpandido('s:' + analiseDestaque(m).id)">
              <div class="acomp-feed-cab">
                <span class="list-row-title acomp-destaque-titulo">
                  ✨ Análise intermediária mais recente<span class="acomp-linha-data"> · {{ formatarDataHora(analiseDestaque(m).solicitada_em) }}</span>
                </span>
                <span class="list-row-sub">{{ subLinhaAnalise(analiseDestaque(m)) }}</span>
              </div>
              <span class="acomp-abrir">
                <span v-if="analiseDestaque(m).status !== 'gerada'" class="badge" :class="statusMeta(analiseDestaque(m).status).badge">{{ statusMeta(analiseDestaque(m).status).label }}</span>
                {{ expandidoId === 's:' + analiseDestaque(m).id ? 'Fechar' : 'Abrir' }}
                <span class="acomp-chevron" :class="{ aberto: expandidoId === 's:' + analiseDestaque(m).id }" aria-hidden="true">▾</span>
              </span>
            </div>
            <div v-if="expandidoId === 's:' + analiseDestaque(m).id" class="acomp-detalhe-box" @click.stop>
              <AcompanhamentoDetalhe :avaliacao="analiseDestaque(m).analise_json" :status="analiseDestaque(m).status" :erro="analiseDestaque(m).erro" />
            </div>
          </div>

          <template v-if="analisesSecundarias(m).length">
            <div v-if="!grupoForcado('sob_demanda')" class="acomp-linha acomp-grupo-head row-clickable" @click="alternarGrupo('an:' + m.anoMes)">
              <span class="acomp-grupo-titulo">✨ {{ rotuloAnalisesSecundarias(m) }}</span>
              <span class="acomp-chevron" :class="{ aberto: grupoAberto('an:' + m.anoMes, 'sob_demanda') }" aria-hidden="true">▾</span>
            </div>
            <template v-if="grupoAberto('an:' + m.anoMes, 'sob_demanda')">
              <div v-for="an in analisesSecundarias(m)" :key="an.id" class="acomp-linha acomp-linha-aninhada">
                <div class="registro-card-head row-clickable" @click="alternarExpandido('s:' + an.id)">
                  <div class="acomp-feed-cab">
                    <span class="list-row-title">✨ Análise intermediária<span class="acomp-linha-data"> · {{ formatarDataHora(an.solicitada_em) }}</span></span>
                    <span class="list-row-sub">{{ subLinhaAnalise(an) }}</span>
                  </div>
                  <span class="acomp-abrir">
                    <span v-if="an.status !== 'gerada'" class="badge" :class="statusMeta(an.status).badge">{{ statusMeta(an.status).label }}</span>
                    <span class="acomp-chevron" :class="{ aberto: expandidoId === 's:' + an.id }" aria-hidden="true">▾</span>
                  </span>
                </div>
                <div v-if="expandidoId === 's:' + an.id" class="acomp-detalhe-box" @click.stop>
                  <AcompanhamentoDetalhe :avaliacao="an.analise_json" :status="an.status" :erro="an.erro" />
                </div>
              </div>
            </template>
          </template>
        </template>

        <!-- Avaliações escritas pelo personal -->
        <template v-if="mostra('personal')">
          <div v-for="p in m.pessoais" :key="p.id" class="acomp-linha">
            <div class="acomp-pessoal-head">
              <div class="acomp-feed-cab">
                <span class="list-row-title">✍️ Sua avaliação<span class="acomp-linha-data"> · {{ formatarDataHora(p.created_at) }}</span></span>
                <span class="list-row-sub">
                  {{ p.autor?.nome || 'personal' }}
                  <template v-if="p.updated_at && p.updated_at !== p.created_at"> · editada</template>
                </span>
              </div>
              <div v-if="editandoId !== p.id" class="acomp-pessoal-acoes">
                <button type="button" class="btn btn-ghost btn-sm" @click="abrirEditorEdicao(p)">Editar</button>
                <button type="button" class="btn btn-danger-ghost btn-sm" @click="excluirAvaliacaoPersonal(p)">Excluir</button>
              </div>
            </div>

            <div v-if="editandoId === p.id" class="acomp-editor" style="margin-top: 10px;">
              <textarea v-model="textoEditor" rows="5" maxlength="5000" aria-label="Editar avaliação do personal"></textarea>
              <div class="acomp-editor-acoes">
                <button type="button" class="btn btn-primary btn-sm" :disabled="salvandoAvaliacao || !textoEditor.trim()" @click="salvarAvaliacaoPersonal">
                  {{ salvandoAvaliacao ? 'Salvando…' : 'Salvar alterações' }}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" @click="fecharEditor">Cancelar</button>
              </div>
            </div>
            <p v-else class="acomp-pessoal-texto">{{ p.texto }}</p>
          </div>
        </template>

        <!-- Relatos: pendentes sempre à vista; confirmados recolhidos num grupo -->
        <template v-if="mostra('relato')">
          <div v-for="r in m.relatosPendentes" :key="r.id" class="acomp-linha">
            <RegistroCard :registro="r" :aberto="expandidoId === 'r:' + r.id" @toggle="alternarExpandido('r:' + r.id)" />
          </div>

          <template v-if="m.relatosConfirmados.length">
            <div v-if="!grupoForcado('relato')" class="acomp-linha acomp-grupo-head row-clickable" @click="alternarGrupo('rel:' + m.anoMes)">
              <span class="acomp-grupo-titulo">
                📋 {{ m.relatosConfirmados.length }} relato(s) confirmado(s)<span class="acomp-linha-data"> · {{ periodoRelatos(m.relatosConfirmados) }}</span>
              </span>
              <span class="acomp-abrir">
                {{ grupoAberto('rel:' + m.anoMes, 'relato') ? 'Recolher' : 'Ver relatos' }}
                <span class="acomp-chevron" :class="{ aberto: grupoAberto('rel:' + m.anoMes, 'relato') }" aria-hidden="true">▾</span>
              </span>
            </div>
            <template v-if="grupoAberto('rel:' + m.anoMes, 'relato')">
              <div v-for="r in m.relatosConfirmados" :key="r.id" class="acomp-linha acomp-linha-aninhada">
                <RegistroCard :registro="r" :aberto="expandidoId === 'r:' + r.id" @toggle="alternarExpandido('r:' + r.id)" />
              </div>
            </template>
          </template>
        </template>

        <p v-if="filtro === 'tudo' && mesVazio(m) && !(ehMesCorrente(m) && novaAberta)" class="list-row-sub acomp-mes-vazio">
          {{ m.emAndamento ? 'Nada registrado neste mês ainda.' : 'Avaliação mensal ainda não gerada para este mês.' }}
        </p>
      </section>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.acomp-cabecalho {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 14px;
}
.acomp-titulo {
  font-size: 17px;
  font-weight: 800;
}
.acomp-ajuda-toggle {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.acomp-ajuda-corpo {
  margin-top: 0;
  margin-bottom: 18px;
}
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
/* Filtros: discretos (texto, sem pílula cheia) para não competirem com as
   abas Acompanhamento / Ficha / Avaliações logo acima. */
.acomp-filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}
.acomp-filtros-rotulo {
  font-size: 12px;
  color: var(--color-text-faint);
  margin-right: 4px;
}
.acomp-chip {
  font-size: 12.5px;
  font-weight: 600;
  padding: 4px 9px;
  border-radius: var(--radius-sm, 6px);
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.acomp-chip:hover {
  background: var(--color-surface-alt);
}
.acomp-chip.ativo {
  background: var(--color-primary-light);
  color: var(--color-primary);
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
.acomp-linha-data {
  font-weight: 400;
  font-size: 12px;
  color: var(--color-text-secondary);
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
  display: inline-block;
  color: var(--color-text-faint);
  font-size: 13px;
  flex: none;
  transition: transform 0.15s ease;
}
.acomp-chevron.aberto {
  transform: rotate(180deg);
}
/* "Abrir ▾" à direita das linhas expansíveis - deixa claro que a linha abre. */
.acomp-abrir {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--color-primary);
}
.row-clickable:hover .list-row-title,
.row-clickable:hover .acomp-grupo-titulo {
  color: var(--color-primary);
}
/* Leitura em destaque do mês (mensal ou análise intermediária mais recente) */
.acomp-destaque {
  background: var(--color-primary-light);
  box-shadow: inset 3px 0 0 var(--color-primary);
}
.acomp-destaque-titulo {
  font-size: 14.5px;
}
.acomp-destaque .acomp-detalhe-box {
  background: var(--color-surface);
}
/* Cabeçalho de grupo recolhível (relatos confirmados / análises anteriores) */
.acomp-grupo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.acomp-grupo-titulo {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--color-text);
}
.acomp-linha-aninhada {
  padding-left: 32px;
  background: var(--color-surface-alt);
}
.acomp-linha-aninhada :deep(.acomp-detalhe-box) {
  background: var(--color-surface);
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
.acomp-compartilhar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
}
.acomp-compartilhar-stale {
  color: var(--color-warning, #b45309);
  font-weight: 600;
}
.acomp-editor-acoes {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
</style>
