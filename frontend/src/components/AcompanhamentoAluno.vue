<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import avaliacoesMensaisService from '../services/avaliacoesMensais.service.js'
import analisesSobDemandaService from '../services/analisesSobDemanda.service.js'
import avaliacoesPersonalService from '../services/avaliacoesPersonal.service.js'
import avaliacoesFisicasService from '../services/avaliacoesFisicas.service.js'
import registrosService from '../services/registros.service.js'
import { formatarDataHora } from '../utils/registroStatus.js'
import { revisaoDesatualizada } from '../utils/avaliacaoMensalCompartilhada.js'
import {
  TIPOS_EVENTO,
  diaDe,
  inicioMesSeguinte,
  montarLinhaDoTempo,
  comDataAgrupada,
  resumoContagem
} from '../utils/linhaDoTempo.js'
import { useToasts } from '../composables/useToasts.js'
import { useConfirm } from '../composables/useConfirm.js'
import ToastStack from './ToastStack.vue'
import AcompanhamentoDetalhe from './AcompanhamentoDetalhe.vue'
import ChevronExpandir from './ChevronExpandir.vue'
import MarcadorLinhaTempo from './MarcadorLinhaTempo.vue'
import RegistroCard from './RegistroCard.vue'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const { toasts, showToast } = useToasts()
const { confirmar, avisar } = useConfirm()

const carregando = ref(true)

// Linha do Tempo do aluno: relatos, avaliações físicas, análises intermediárias
// de IA (docs/adr/0015), observações do personal e o Acompanhamento Mensal num
// feed único por mês, em ordem cronológica, mais recente primeiro (montagem em
// utils/linhaDoTempo.js). O Acompanhamento Mensal abre o mês como "fechamento"
// - é o evento mais recente dele; no mês corrente aparece como previsto. O
// card do mês corrente é o hub de ações.
const registros = ref([])
const avaliacoes = ref([])
const analises = ref([])
const avaliacoesPersonal = ref([])
const avaliacoesFisicas = ref([])
const disponibilidade = ref(null)

const expandidoId = ref(null)
const ocultos = ref(new Set()) // tipos de evento desligados no "Mostrar"
const mostrarAjuda = ref(false)

// Ações
const gerandoMes = ref(null) // "YYYY-MM" do mês cujo Acompanhamento Mensal está sendo (re)gerado
const solicitandoAnalise = ref(false)
const mensagemInsuficiente = ref('')
const novaAberta = ref(false) // editor de nova observação, no card do mês corrente
const editandoId = ref(null) // id da observação em edição inline (na linha dela)
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

// Mês corrente e o anterior abertos; os mais antigos ficam recolhidos no resumo.
const mesesAbertos = ref(new Set([mesRef(0), mesRef(-1)]))
function mesAberto(m) {
  return mesesAbertos.value.has(m.anoMes)
}
function alternarMes(anoMes) {
  if (mesesAbertos.value.has(anoMes)) mesesAbertos.value.delete(anoMes)
  else mesesAbertos.value.add(anoMes)
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
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
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
// Coluna de data da linha: "28/10" + "qua".
function rotuloDia(dia) {
  const [, mes, d] = String(dia).split('-')
  return `${d}/${mes}`
}
function diaSemana(dia) {
  const [ano, mes, d] = String(dia).split('-').map(Number)
  return DIAS_SEMANA[new Date(ano, mes - 1, d).getDay()]
}

// ---- Tipos e filtro "Mostrar" ---------------------------------------------
const ROTULO_CHIP = {
  mensal: 'Acompanhamento Mensal',
  relato: 'Relatos',
  fisica: 'Avaliações físicas',
  analise: 'Análises de IA',
  observacao: 'Observações'
}
const ROTULO_TIPO = {
  fisica: 'Avaliação física',
  analise: 'Análise intermediária de IA',
  observacao: 'Observação do personal'
}

function mostraTipo(tipo) {
  return !ocultos.value.has(tipo)
}
function alternarTipo(tipo) {
  if (ocultos.value.has(tipo)) ocultos.value.delete(tipo)
  else ocultos.value.add(tipo)
}
function exibirTipo(tipo) {
  ocultos.value.delete(tipo)
}

const linha = computed(() =>
  montarLinhaDoTempo({
    registros: registros.value,
    mensais: avaliacoes.value,
    analises: analises.value,
    observacoes: avaliacoesPersonal.value,
    avaliacoesFisicas: avaliacoesFisicas.value,
    mesAtual: mesCorrente.value
  })
)

const contagemTotal = computed(() => {
  const total = { mensal: avaliacoes.value.length, relato: 0, fisica: 0, analise: 0, observacao: 0 }
  for (const m of linha.value) for (const tipo of Object.keys(m.contagem)) total[tipo] += m.contagem[tipo]
  return total
})

function eventosVisiveis(m) {
  return comDataAgrupada(m.eventos.filter((e) => mostraTipo(e.tipo)))
}

// ---- Acompanhamento Mensal (fechamento do mês) -----------------------------
// Gerar/regerar só faz sentido para o mês atual, o anterior (candidatos do job)
// ou qualquer mês que já tenha Acompanhamento Mensal (regeneração).
function podeGerar(m) {
  return m.mensal != null || m.anoMes >= mesRef(-1)
}
// Sem Acompanhamento Mensal ainda: o mês corrente mostra o previsto; o
// anterior (o job pode não ter rodado) mostra o pendente com o botão de gerar.
function mostraPrevisto(m) {
  return !m.mensal && podeGerar(m) && mostraTipo('mensal')
}
function subLinhaPrevisto(m) {
  const partes = []
  if (m.emAndamento) partes.push(`Gerado automaticamente em ${rotuloDia(inicioMesSeguinte(m.anoMes))}`)
  else partes.push('Ainda não gerado')
  partes.push(`${m.confirmadosNoMes} relato(s) confirmado(s) no mês (mínimo 3)`)
  if (m.pendentes) partes.push(`${m.pendentes} aguardando revisão`)
  return partes.join(' · ')
}

function formatarDataCurta(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Estado do compartilhamento do Acompanhamento Mensal (docs/adr/0023).
function estadoCompartilhamento(av) {
  if (!av || av.status !== 'gerada') return null
  if (!av.revisao) return { rotulo: 'Ainda não compartilhado', stale: false }
  if (revisaoDesatualizada(av, av.revisao)) {
    return { rotulo: 'Revisão desatualizada — o Acompanhamento Mensal mudou depois', stale: true }
  }
  return { rotulo: `Compartilhado em ${formatarDataCurta(av.revisao.compartilhada_em)}`, stale: false }
}

// Selo do cabeçalho do mês: a situação do Acompanhamento Mensal dele.
function estadoMes(m) {
  const av = m.mensal
  if (!av) {
    if (m.emAndamento) return { rotulo: 'Mês em andamento', badge: 'badge-neutral' }
    return { rotulo: 'Sem Acompanhamento Mensal', badge: 'badge-neutral' }
  }
  if (av.status !== 'gerada') return { rotulo: statusMeta(av.status).label, badge: statusMeta(av.status).badge }
  const comp = estadoCompartilhamento(av)
  if (comp.stale) return { rotulo: 'Revisão desatualizada', badge: 'badge-warning' }
  if (av.revisao) return { rotulo: `Compartilhado em ${formatarDataCurta(av.revisao.compartilhada_em).slice(0, 5)}`, badge: 'badge-success' }
  return { rotulo: 'Gerado · não compartilhado', badge: 'badge-primary' }
}

function subLinhaMensal(av) {
  if (!av) return ''
  const partes = [`${av.relatos_considerados} relato(s)`]
  const n = (av.avaliacoes_personal_consideradas || []).length
  if (n) partes.push(`${n} observação(ões) sua(s)`)
  const f = (av.avaliacoes_fisicas_consideradas || []).length
  if (f) partes.push(f === 1 ? '1 avaliação física' : `${f} avaliações físicas`)
  if (av.origem === 'manual') partes.push('gerado manualmente')
  return `Fecha o mês · considerou ${partes.join(' · ')}`
}

// ---- Linhas de evento -----------------------------------------------------
function tituloAnalise(an) {
  if (an.status !== 'gerada') return 'Análise intermediária de IA'
  const resumo = an.analise_json?.resumo_geral || ''
  return resumo.split(/(?<=[.!?])\s/)[0] || 'Análise intermediária de IA'
}
function subLinhaAnalise(an) {
  const partes = [`${an.relatos_considerados} relato(s) recente(s)`]
  if ((an.baseada_em_avaliacao_personal_ids || []).length) partes.push('inclui observação sua')
  partes.push('só você vê')
  return partes.join(' · ')
}

// Avaliação física: medida principal de peso, % gordura e IMC.
function valorFisica(av, codigo) {
  const m = (av.medidas || []).find((x) => x.metrica_codigo === codigo && x.principal)
  if (!m) return null
  const n = Number(m.valor)
  return Number.isFinite(n) ? n.toFixed(m.metrica?.casas_decimais ?? 1).replace('.', ',') : m.valor
}
function tituloFisica(av) {
  const partes = []
  const peso = valorFisica(av, 'peso')
  const gordura = valorFisica(av, 'percentual_gordura')
  const imc = valorFisica(av, 'imc')
  if (peso) partes.push(`Peso ${peso} kg`)
  if (gordura) partes.push(`gordura ${gordura}%`)
  if (imc) partes.push(`IMC ${imc}`)
  return partes.join(' · ') || 'Avaliação física'
}
const ORIGEM_FISICA = {
  captura_ia: 'capturada por voz',
  legado_bodymove: 'importada do BodyMove',
  manual: 'registrada no formulário'
}
function subLinhaFisica(av) {
  return ORIGEM_FISICA[av.origem] || 'registrada no formulário'
}
function abrirAbaAvaliacoes() {
  router.replace({ query: { aba: 'avaliacoes' } })
}

function marcaRelato(e) {
  if (!e.contaNoMes) return ''
  return `Confirmado em ${nomeMes(e.contaNoMes)} — conta no Acompanhamento Mensal de ${nomeMes(e.contaNoMes)}`
}

function vazioDoMes(m) {
  return !eventosVisiveis(m).length && !(m.mensal && mostraTipo('mensal')) && !mostraPrevisto(m)
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
  // Filtro no servidor (docs/adr/0020) - sem ele vinham os relatos da equipe inteira.
  registros.value = await registrosService.listar({ alunoId: props.id })
}

async function carregar() {
  carregando.value = true
  try {
    const [lista, fisicas] = await Promise.all([
      avaliacoesMensaisService.listarPorAluno(props.id),
      avaliacoesFisicasService.listar(props.id),
      carregarRegistros(),
      carregarAnalises(),
      carregarAvaliacoesPersonal()
    ])
    avaliacoes.value = lista
    avaliacoesFisicas.value = fisicas
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

// ---- Ações: Acompanhamento Mensal ----------------------------------------
async function gerar(anoMes) {
  gerandoMes.value = anoMes
  mensagemInsuficiente.value = ''
  try {
    const resultado = await avaliacoesMensaisService.gerar(props.id, anoMes)
    // Geração manual com dados insuficientes não vira registro (docs/adr/0015):
    // mostra o motivo, não mexe no feed, e o botão fica livre pra tentar de novo.
    if (resultado.persistida === false) {
      mensagemInsuficiente.value = resultado.mensagem
      showToast('Relatos insuficientes para gerar o Acompanhamento Mensal — nada foi alterado.', 'neutral')
      return
    }
    avaliacoes.value = await avaliacoesMensaisService.listarPorAluno(props.id)
    exibirTipo('mensal')
    mesesAbertos.value.add(resultado.ano_mes)
    expandidoId.value = `m:${resultado.ano_mes}`
    if (resultado.status === 'gerada') {
      showToast(`Acompanhamento Mensal de ${rotuloMes(resultado.ano_mes)} gerado.`, 'success')
    } else {
      await avisar({
        titulo: 'A IA não conseguiu gerar o Acompanhamento Mensal',
        mensagem:
          'O provedor de IA não respondeu agora. Isso costuma ser temporário — tente de novo em alguns minutos.' +
          (resultado.erro ? `\n\nDetalhe técnico:\n${resultado.erro}` : '')
      })
    }
  } catch (err) {
    await avisar({
      titulo: 'Não foi possível gerar o Acompanhamento Mensal',
      mensagem:
        'Houve um erro ao falar com o servidor. Verifique a conexão e tente de novo em alguns minutos.' +
        (err?.response?.data?.error?.message ? `\n\nDetalhe técnico:\n${err.response.data.error.message}` : '')
    })
  } finally {
    gerandoMes.value = null
  }
}

// ---- Ações: análise intermediária de IA ----------------------------------
async function solicitarAnalise() {
  solicitandoAnalise.value = true
  mensagemInsuficiente.value = ''
  try {
    const resultado = await analisesSobDemandaService.solicitar(props.id)
    if (resultado.persistida === false) {
      mensagemInsuficiente.value = resultado.mensagem
      showToast('Dados insuficientes para uma análise intermediária de IA — nada foi consumido.', 'neutral')
      return
    }
    await carregarAnalises()
    exibirTipo('analise')
    mesesAbertos.value.add(mesCorrente.value)
    expandidoId.value = `s:${resultado.id}`
    if (resultado.status === 'gerada') {
      showToast('Análise intermediária de IA gerada.', 'success')
    } else {
      // Falha da IA: a linha foi criada com o erro. Modal que fica até o
      // usuário fechar (o toast some rápido demais para uma mensagem dessas).
      await avisar({
        titulo: 'A IA não conseguiu gerar a análise intermediária',
        mensagem:
          'O provedor de IA não respondeu agora. Isso costuma ser temporário — tente de novo em alguns minutos.' +
          (resultado.erro ? `\n\nDetalhe técnico:\n${resultado.erro}` : '')
      })
    }
  } catch (err) {
    const detalhe = err?.response?.data?.error?.message
    await avisar({
      titulo: 'Não foi possível solicitar a análise intermediária',
      mensagem:
        'Houve um erro ao falar com o servidor. Verifique a conexão e tente de novo em alguns minutos.' +
        (detalhe ? `\n\nDetalhe técnico:\n${detalhe}` : '')
    })
    await carregarAnalises()
  } finally {
    solicitandoAnalise.value = false
  }
}

// ---- Ações: observação do personal -----------------------------------------
function abrirEditorNova() {
  editandoId.value = null
  textoEditor.value = ''
  novaAberta.value = true
  mesesAbertos.value.add(mesCorrente.value)
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
    let salvaId = editandoId.value
    if (editando) {
      await avaliacoesPersonalService.atualizar(props.id, editandoId.value, texto)
      showToast('Observação atualizada.', 'success')
    } else {
      salvaId = (await avaliacoesPersonalService.criar(props.id, texto))?.id
      showToast('Observação registrada — entra no próximo Acompanhamento Mensal.', 'success')
    }
    fecharEditor()
    exibirTipo('observacao')
    // Recém-salva fica aberta, como a análise recém-gerada.
    if (salvaId) expandidoId.value = `o:${salvaId}`
    await carregarAvaliacoesPersonal()
  } catch (err) {
    showToast(err?.response?.data?.error?.message || 'Não foi possível salvar a observação.', 'warning')
  } finally {
    salvandoAvaliacao.value = false
  }
}

async function excluirAvaliacaoPersonal(avaliacao) {
  const ok = await confirmar({
    titulo: 'Excluir esta observação?',
    mensagem: 'Ela não será mais considerada nas próximas análises da IA.',
    perigo: true
  })
  if (!ok) return
  try {
    await avaliacoesPersonalService.excluir(props.id, avaliacao.id)
    showToast('Observação excluída.', 'neutral')
    await carregarAvaliacoesPersonal()
  } catch (_err) {
    showToast('Não foi possível excluir a observação.', 'warning')
  }
}
</script>

<template>
  <div>
    <div class="acomp-cabecalho">
      <h2 class="acomp-titulo">Linha do Tempo</h2>
      <button type="button" class="acomp-ajuda-toggle" :aria-expanded="mostrarAjuda" @click="mostrarAjuda = !mostrarAjuda">
        ⓘ Como funciona
      </button>

      <!-- "Mostrar": liga/desliga cada tipo de evento (todos ligados por padrão) -->
      <div class="acomp-filtros">
        <span class="acomp-filtros-rotulo">Mostrar:</span>
        <button
          v-for="tipo in TIPOS_EVENTO"
          :key="tipo"
          type="button"
          class="acomp-chip"
          :class="{ ativo: mostraTipo(tipo) }"
          :aria-pressed="mostraTipo(tipo)"
          @click="alternarTipo(tipo)"
        >
          <span class="acomp-chip-ponto" :class="'tipo-' + tipo" aria-hidden="true"></span>{{ ROTULO_CHIP[tipo] }}<span v-if="contagemTotal[tipo]" class="acomp-chip-num">{{ contagemTotal[tipo] }}</span>
        </button>
      </div>
    </div>
    <div v-if="mostrarAjuda" class="exercise-obs acomp-ajuda-corpo">
      <span class="acomp-obs-item">
        Tudo o que aconteceu com o aluno, mês a mês, do mais recente para o mais antigo. Relatos e avaliações
        físicas ficam na data do atendimento.
      </span>
      <span class="acomp-obs-item">
        As análises da IA são apoio técnico e não substituem o seu julgamento. Você também pode registrar suas
        próprias observações, que serão consideradas nas próximas análises junto aos relatos.
      </span>
      <span class="acomp-obs-item">
        O Acompanhamento Mensal fecha o mês: é gerado automaticamente no início do mês seguinte, desde que haja pelo
        menos 3 relatos confirmados no mês. É ele que você revisa e envia ao aluno em PDF.
      </span>
    </div>

    <div v-if="carregando" class="card empty-state">Carregando…</div>

    <div v-else class="acomp-meses">
      <section v-for="m in linha" :key="m.anoMes" class="card acomp-mes-card">
        <header class="acomp-mes-head" :class="{ aberto: mesAberto(m) }">
          <!-- Linha do mês: título à esquerda, ações (mês corrente) à direita.
               A linha toda abre/recolhe; o título é o botão de teclado. -->
          <div class="acomp-mes-linha row-clickable" @click="alternarMes(m.anoMes)">
            <button type="button" class="acomp-mes-toggle" :aria-expanded="mesAberto(m)" @click.stop="alternarMes(m.anoMes)">
              <span class="acomp-mes-titulo">
                <h2>{{ rotuloMesLongo(m.anoMes) }}</h2>
                <span class="badge" :class="estadoMes(m).badge">{{ estadoMes(m).rotulo }}</span>
                <span class="acomp-mes-resumo">{{ resumoContagem(m.contagem) }}</span>
              </span>
            </button>

            <!-- Hub de ações: só no card do mês corrente; o clique não recolhe o mês -->
            <div v-if="ehMesCorrente(m)" class="acomp-acoes-grupo" @click.stop>
              <button
                type="button"
                class="btn btn-primary btn-sm"
                title="Solicitar análise intermediária de IA"
                :disabled="solicitandoAnalise || (disponibilidade && !disponibilidade.disponivel_agora)"
                @click="solicitarAnalise"
              >
                <span aria-hidden="true">✨</span>
                {{ solicitandoAnalise ? 'Analisando…' : 'Nova análise de IA' }}
              </button>
              <button type="button" class="btn btn-primary btn-sm" title="Escrever observação do personal" @click="abrirEditorNova">
                <span aria-hidden="true">✍️</span>
                Nova observação
              </button>
            </div>
            <ChevronExpandir :aberto="mesAberto(m)" />
          </div>

          <!-- Avisos do mês corrente -->
          <template v-if="ehMesCorrente(m)">
            <span v-if="disponibilidade && !disponibilidade.disponivel_agora" class="list-row-sub">
              Próxima análise intermediária de IA em <strong>{{ formatarDataHora(disponibilidade.proxima_disponivel_em) }}</strong>.
            </span>
            <div v-if="mensagemInsuficiente" class="exercise-obs acomp-mes-aviso">{{ mensagemInsuficiente }}</div>
          </template>
        </header>

        <div v-if="mesAberto(m)" class="lt-lista">
          <!-- Editor de nova observação (card do mês corrente) -->
          <div v-if="ehMesCorrente(m) && novaAberta" class="acomp-editor lt-editor-novo">
            <textarea
              v-model="textoEditor"
              rows="5"
              maxlength="5000"
              aria-label="Nova observação do personal"
              placeholder="Ex.: Aluno vem mais consistente, dormindo melhor. Ainda evita treino de pernas — vou insistir na próxima ficha."
            ></textarea>
            <div class="acomp-editor-acoes">
              <button type="button" class="btn btn-primary btn-sm" :disabled="salvandoAvaliacao || !textoEditor.trim()" @click="salvarAvaliacaoPersonal">
                {{ salvandoAvaliacao ? 'Salvando…' : 'Salvar observação' }}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" @click="fecharEditor">Cancelar</button>
            </div>
          </div>

          <!-- Fechamento do mês: Acompanhamento Mensal (avaliacao_mensal) -->
          <div v-if="m.mensal && mostraTipo('mensal')" class="lt-evento">
            <div class="lt-data">
              <div class="lt-data-dia">{{ rotuloDia(diaDe(m.mensal.gerada_em)) }}</div>
              <div class="lt-data-semana">{{ diaSemana(diaDe(m.mensal.gerada_em)) }}</div>
            </div>
            <div class="lt-trilho"><MarcadorLinhaTempo tipo="mensal" /></div>
            <div class="lt-conteudo">
              <div class="lt-fechamento">
                <div class="lt-fechamento-head row-clickable" @click="alternarExpandido('m:' + m.anoMes)">
                  <div class="acomp-feed-cab lt-fechamento-cab">
                    <span class="lt-etiquetas">
                      <span class="lt-fechamento-rotulo">Fechamento do mês</span>
                      <span class="badge" :class="estadoMes(m).badge">{{ estadoMes(m).rotulo }}</span>
                    </span>
                    <span class="lt-fechamento-titulo">Acompanhamento Mensal de {{ nomeMes(m.anoMes) }}</span>
                    <span class="list-row-sub">{{ subLinhaMensal(m.mensal) }}</span>
                    <span v-if="estadoCompartilhamento(m.mensal)?.stale" class="list-row-sub acomp-compartilhar-stale">
                      {{ estadoCompartilhamento(m.mensal).rotulo }}
                    </span>
                  </div>
                  <!-- Ações sempre à vista; o clique nelas não abre/fecha a faixa -->
                  <div class="lt-fechamento-acoes" @click.stop>
                    <!-- Compartilhar com o aluno (docs/adr/0023) - só quando a IA gerou. -->
                    <router-link
                      v-if="estadoCompartilhamento(m.mensal)"
                      class="btn btn-primary btn-sm"
                      :to="{ name: 'compartilhar-avaliacao-mensal', params: { id: props.id, anoMes: m.anoMes } }"
                    >
                      <span v-if="m.mensal.revisao" aria-hidden="true">📄</span>
                      <svg v-else class="btn-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></svg>
                      {{ m.mensal.revisao ? 'Revisar / gerar PDF' : 'Compartilhar com o aluno' }}
                    </router-link>
                    <button
                      type="button"
                      class="btn btn-primary btn-sm"
                      title="Regerar o Acompanhamento Mensal"
                      :disabled="gerandoMes === m.anoMes"
                      @click="gerar(m.anoMes)"
                    >
                      <svg class="btn-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4" /></svg>
                      {{ gerandoMes === m.anoMes ? 'Gerando…' : 'Regerar' }}
                    </button>
                  </div>
                  <ChevronExpandir :aberto="expandidoId === 'm:' + m.anoMes" />
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
            </div>
          </div>

          <!-- Ainda sem Acompanhamento Mensal: previsto (mês corrente) ou pendente (mês anterior) -->
          <div v-else-if="mostraPrevisto(m)" class="lt-evento">
            <div class="lt-data">
              <template v-if="m.emAndamento">
                <div class="lt-data-dia">{{ rotuloDia(inicioMesSeguinte(m.anoMes)) }}</div>
                <div class="lt-data-semana">previsto</div>
              </template>
            </div>
            <div class="lt-trilho"><MarcadorLinhaTempo tipo="mensal" previsto /></div>
            <div class="lt-conteudo">
              <div class="lt-fechamento previsto">
                <div class="lt-previsto-corpo">
                  <div class="acomp-feed-cab">
                    <span class="lt-fechamento-rotulo">Fechamento do mês</span>
                    <span class="lt-fechamento-titulo">Acompanhamento Mensal de {{ nomeMes(m.anoMes) }}</span>
                    <span class="list-row-sub">{{ subLinhaPrevisto(m) }}</span>
                  </div>
                  <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    title="Gerar o Acompanhamento Mensal agora"
                    :disabled="gerandoMes === m.anoMes"
                    @click="gerar(m.anoMes)"
                  >
                    <span aria-hidden="true">✨</span>
                    {{ gerandoMes === m.anoMes ? 'Gerando…' : 'Gerar agora' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Eventos do mês, do mais recente ao mais antigo -->
          <div v-for="e in eventosVisiveis(m)" :key="e.chave" class="lt-evento">
            <div class="lt-data">
              <template v-if="e.mostrarData">
                <div class="lt-data-dia">{{ rotuloDia(e.dia) }}</div>
                <div class="lt-data-semana">{{ diaSemana(e.dia) }}</div>
              </template>
            </div>
            <div class="lt-trilho"><MarcadorLinhaTempo :tipo="e.tipo" /></div>

            <div class="lt-conteudo">
              <!-- Relato (ou captura de avaliação física ainda não confirmada) -->
              <div v-if="e.registro" class="lt-item">
                <RegistroCard
                  :registro="e.registro"
                  :marca="marcaRelato(e)"
                  :aberto="expandidoId === e.chave"
                  @toggle="alternarExpandido(e.chave)"
                />
              </div>

              <!-- Avaliação física (dado oficial) -->
              <div v-else-if="e.avaliacao" class="lt-item">
                <div class="registro-card-head row-clickable" @click="alternarExpandido(e.chave)">
                  <div class="acomp-feed-cab">
                    <span class="lt-etiquetas"><span class="tipo-tag tipo-fisica">{{ ROTULO_TIPO.fisica }}</span></span>
                    <span class="list-row-title lt-titulo">{{ tituloFisica(e.avaliacao) }}</span>
                    <span class="list-row-sub">{{ subLinhaFisica(e.avaliacao) }}</span>
                  </div>
                  <ChevronExpandir :aberto="expandidoId === e.chave" />
                </div>
                <div v-if="expandidoId === e.chave" class="acomp-detalhe-box" @click.stop>
                  <p>Medidas completas, anamnese, postural e comparação com as anteriores ficam na aba Avaliações Físicas.</p>
                  <div class="lt-acoes">
                    <button type="button" class="btn btn-ghost btn-sm" @click="abrirAbaAvaliacoes">Ver em Avaliações Físicas</button>
                  </div>
                </div>
              </div>

              <!-- Análise intermediária de IA -->
              <div v-else-if="e.analise" class="lt-item">
                <div class="registro-card-head row-clickable" @click="alternarExpandido(e.chave)">
                  <div class="acomp-feed-cab">
                    <span class="lt-etiquetas">
                      <span class="tipo-tag tipo-analise">{{ ROTULO_TIPO.analise }}</span>
                      <span v-if="e.analise.status !== 'gerada'" class="badge" :class="statusMeta(e.analise.status).badge">{{ statusMeta(e.analise.status).label }}</span>
                    </span>
                    <span class="list-row-title lt-titulo" :class="{ 'lt-titulo-1linha': expandidoId !== e.chave }">{{ tituloAnalise(e.analise) }}</span>
                    <span class="list-row-sub">{{ subLinhaAnalise(e.analise) }}</span>
                  </div>
                  <ChevronExpandir :aberto="expandidoId === e.chave" />
                </div>
                <div v-if="expandidoId === e.chave" class="acomp-detalhe-box" @click.stop>
                  <AcompanhamentoDetalhe :avaliacao="e.analise.analise_json" :status="e.analise.status" :erro="e.analise.erro" />
                </div>
              </div>

              <!-- Observação do personal (avaliacao_personal) -->
              <div v-else-if="e.observacao" class="lt-item">
                <div class="registro-card-head row-clickable" @click="alternarExpandido(e.chave)">
                  <div class="acomp-feed-cab">
                    <span class="lt-etiquetas"><span class="tipo-tag tipo-observacao">{{ ROTULO_TIPO.observacao }}</span></span>
                    <span v-if="expandidoId !== e.chave" class="list-row-title lt-titulo lt-titulo-1linha">{{ e.observacao.texto }}</span>
                    <span class="list-row-sub">
                      {{ e.observacao.autor?.nome || 'personal' }}
                      <template v-if="e.observacao.updated_at && e.observacao.updated_at !== e.observacao.created_at"> · editada</template>
                    </span>
                  </div>
                  <ChevronExpandir :aberto="expandidoId === e.chave" />
                </div>

                <div v-if="expandidoId === e.chave" class="acomp-detalhe-box" @click.stop>
                  <div v-if="editandoId === e.observacao.id" class="acomp-editor">
                    <textarea v-model="textoEditor" rows="5" maxlength="5000" aria-label="Editar observação do personal"></textarea>
                    <div class="acomp-editor-acoes">
                      <button type="button" class="btn btn-primary btn-sm" :disabled="salvandoAvaliacao || !textoEditor.trim()" @click="salvarAvaliacaoPersonal">
                        {{ salvandoAvaliacao ? 'Salvando…' : 'Salvar alterações' }}
                      </button>
                      <button type="button" class="btn btn-ghost btn-sm" @click="fecharEditor">Cancelar</button>
                    </div>
                  </div>
                  <template v-else>
                    <p class="acomp-pessoal-texto">{{ e.observacao.texto }}</p>
                    <div class="lt-acoes">
                      <button type="button" class="btn btn-ghost btn-sm" @click="abrirEditorEdicao(e.observacao)">Editar</button>
                      <button type="button" class="btn btn-danger-ghost btn-sm" @click="excluirAvaliacaoPersonal(e.observacao)">Excluir</button>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <p v-if="vazioDoMes(m) && !(ehMesCorrente(m) && novaAberta)" class="list-row-sub lt-vazio">
            {{ m.emAndamento ? 'Nada registrado neste mês ainda.' : 'Nada para mostrar neste mês com os tipos selecionados.' }}
          </p>
        </div>
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
.acomp-obs-item {
  display: block;
}
.acomp-obs-item + .acomp-obs-item {
  margin-top: 8px;
}
.acomp-obs-item::before {
  content: '● ';
}

/* "Mostrar": discreto e à direita, para não parecer uma 2ª barra de abas */
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  padding: 4px 9px;
  border-radius: var(--radius-sm, 6px);
  background: none;
  border: none;
  color: var(--color-text-faint);
  cursor: pointer;
  text-decoration: line-through;
}
.acomp-chip:hover {
  background: var(--color-surface-alt);
}
.acomp-chip.ativo {
  color: var(--color-text-secondary);
  text-decoration: none;
}
.acomp-chip-ponto {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  opacity: 0.35;
}
.acomp-chip.ativo .acomp-chip-ponto {
  opacity: 1;
  box-shadow: inset 0 0 0 1.5px currentColor;
}
.acomp-chip-ponto.tipo-mensal {
  background: var(--color-primary);
}
.acomp-chip-num {
  opacity: 0.7;
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
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-surface-alt);
}
.acomp-mes-head.aberto {
  border-bottom: 1px solid var(--color-border);
}
.acomp-mes-linha {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
  width: 100%;
}
.acomp-mes-toggle {
  flex: 1 1 260px;
  min-width: 0;
  text-align: left;
}
.acomp-mes-linha:hover h2 {
  color: var(--color-primary);
}
.acomp-mes-linha .acomp-acoes-grupo {
  cursor: default;
}
/* Ícones de traço ("Compartilhar" e "Regerar"), na cor do texto do botão. */
.btn-ic {
  width: 15px;
  height: 15px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
/* Botões de ação da Linha do Tempo: texto sem negrito. */
.acomp-acoes-grupo .btn,
.lt-fechamento-acoes .btn,
.lt-previsto-corpo .btn {
  font-weight: 400;
}
.acomp-mes-titulo {
  display: flex;
  align-items: center;
  gap: 8px 10px;
  flex-wrap: wrap;
  min-width: 0;
}
.acomp-mes-titulo h2 {
  font-size: 15px;
  margin: 0;
}
.acomp-mes-resumo {
  font-size: 12.5px;
  color: var(--color-text-secondary);
}
.acomp-acoes-grupo {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.acomp-mes-aviso {
  margin: 0;
}

/* Linha do Tempo: [data] [trilho com marcador] [conteúdo] */
.lt-lista {
  padding: 8px 14px 12px 6px;
}
.lt-editor-novo {
  margin: 6px 0 10px 98px;
}
.lt-evento {
  display: grid;
  grid-template-columns: 52px 32px minmax(0, 1fr);
  column-gap: 10px;
}
.lt-data {
  padding-top: 15px;
  text-align: right;
}
.lt-data-dia {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.lt-data-semana {
  font-size: 11.5px;
  color: var(--color-text-secondary);
}
.lt-trilho {
  position: relative;
  display: flex;
  justify-content: center;
  padding-top: 14px;
}
.lt-trilho::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  background: var(--color-border);
}
.lt-evento:first-of-type .lt-trilho::before {
  top: 14px;
}
.lt-evento:last-of-type .lt-trilho::before {
  bottom: auto;
  height: 30px;
}
.lt-conteudo {
  min-width: 0;
  padding: 4px 0;
}
.lt-item {
  padding: 10px 12px;
  border-radius: var(--radius-md);
}
.lt-item:hover {
  background: var(--color-surface-alt);
}
.acomp-feed-cab {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.lt-etiquetas {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.lt-titulo {
  font-weight: 600;
  font-size: 14px;
}
.lt-titulo-1linha {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-clickable:hover .list-row-title {
  color: var(--color-primary);
}

/* Fechamento do mês (Acompanhamento Mensal): faixa de destaque */
.lt-fechamento {
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  background: var(--color-primary-light);
  border: 1.5px solid #c7d2fe;
}
.lt-fechamento.previsto {
  background: var(--color-surface);
  border-style: dashed;
}
.lt-fechamento .acomp-detalhe-box {
  background: var(--color-surface);
}
.lt-fechamento-rotulo {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--color-primary-dark);
}
.lt-fechamento-titulo {
  font-size: 15.5px;
  font-weight: 800;
}
.lt-fechamento .row-clickable:hover .lt-fechamento-titulo {
  color: var(--color-primary);
}
.lt-previsto-corpo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
}
.lt-vazio {
  padding: 10px 16px 6px 98px;
}

/* Detalhe expandido */
.acomp-detalhe-box {
  margin-top: 10px;
  padding: 14px 16px;
  background: var(--color-surface-alt);
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}
.lt-item:hover .acomp-detalhe-box {
  background: var(--color-surface);
}
.lt-acoes {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.acomp-pessoal-texto {
  font-size: 13.5px;
  line-height: 1.6;
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
/* Título à esquerda, ações à direita; em tela estreita as ações descem. */
.lt-fechamento-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
}
.lt-fechamento-cab {
  flex: 1 1 260px;
}
.lt-fechamento-acoes {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  cursor: default;
}
.acomp-compartilhar-stale {
  color: var(--color-warning, #b45309);
  font-weight: 600;
}

@media (max-width: 760px) {
  .lt-lista {
    padding: 6px 8px 10px 0;
  }
  .lt-evento {
    grid-template-columns: 40px 26px minmax(0, 1fr);
    column-gap: 6px;
  }
  .lt-data-dia {
    font-size: 12px;
  }
  .lt-item {
    padding: 10px 6px;
  }
  .lt-editor-novo,
  .lt-vazio {
    margin-left: 0;
    padding-left: 8px;
  }
}
</style>
