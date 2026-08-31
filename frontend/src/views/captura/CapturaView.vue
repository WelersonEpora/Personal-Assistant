<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAuthStore } from '../../stores/auth.store.js'
import { useSyncQueueStore } from '../../stores/syncQueue.store.js'
import alunosService from '../../services/alunos.service.js'
import registrosService from '../../services/registros.service.js'
import usuariosService from '../../services/usuarios.service.js'
import { salvarAlunosCache, listarAlunosCache, salvarAudioLocal, removerAudioLocal, obterAudioLocal } from '../../offline/db.js'
import { criarGravador } from '../../offline/recorder.js'
import { useToasts } from '../../composables/useToasts.js'
import {
  statusMeta,
  tipoMeta,
  resumoEntradas,
  corParaId,
  iniciais,
  formatarDataHora,
  hojeYmd,
  rotuloDataAtendimento
} from '../../utils/registroStatus.js'
import { gerarUuid } from '../../utils/uuid.js'
import {
  resolverGesto,
  progressoTravar,
  estadoDuracao,
  formatarCronometro,
  criarRelogioGravacao,
  DURACAO_MINIMA_MS
} from '../../utils/gravacaoVoz.js'
import AlunoSheet from '../../components/AlunoSheet.vue'
import RoteiroDitado from '../../components/RoteiroDitado.vue'
import SeletorDataAtendimento from '../../components/SeletorDataAtendimento.vue'
import ToastStack from '../../components/ToastStack.vue'

const ULTIMO_ALUNO_KEY = 'personal_assistant_ultimo_aluno'
const ULTIMO_TIPO_KEY = 'personal_assistant_ultimo_tipo'

const auth = useAuthStore()
const syncQueue = useSyncQueueStore()
const { toasts, showToast } = useToasts()
const gravador = criarGravador()

// Os erros de captura/gravação vêm do IndexedDB e do MediaRecorder e variam
// muito por navegador (o Safari do iOS é o caso mais problemático). Sem
// dispositivo em mãos para depurar, o `err.name` no console + no toast é a
// única pista. `contexto` identifica de onde veio.
function relatarErro(contexto, err) {
  const nome = err?.name || 'Erro'
  console.error(`[captura:${contexto}]`, nome, err?.message || err, err)
  return nome
}

const alunos = ref([])
const alunoAtualId = ref(null)
const sheetAberto = ref(false)
// docs/adr/0018 - tipo escolhido ANTES de iniciar (nunca inferido depois).
const TIPOS_VALIDOS = ['atendimento', 'avaliacao_fisica']
const tipoSelecionadoSalvo = localStorage.getItem(ULTIMO_TIPO_KEY)
const tipoSelecionado = ref(TIPOS_VALIDOS.includes(tipoSelecionadoSalvo) ? tipoSelecionadoSalvo : 'atendimento')
const registroTituloInput = ref('')
const composerTexto = ref('')
// docs/adr/0021 - máquina de estados do microfone (interação estilo WhatsApp):
//   idle      -> parado
//   segurando -> apertado e gravando; soltar envia, arrastar ↑ trava
//   travado   -> mãos-livres; encerra pelos botões lixeira / enviar
const micEstado = ref('idle')
const cronometro = ref('0:00')
const gravacaoLonga = ref(false)
const gravacaoPausada = ref(false)
const travarProgresso = ref(0)
const discardConfirmando = ref(false)
const registrosServidorRecentes = ref([])

const gravando = computed(() => micEstado.value !== 'idle')
const suportaPausa = typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.prototype.pause === 'function'

const relogioGravacao = criarRelogioGravacao()
let cronometroInterval = null
let gestoPointerId = null
let gestoOrigemY = 0
// janela curta logo depois de travar em que cliques no composer são
// ignorados - soltar o dedo depois do arraste não pode disparar "enviar".
let suprimirCliqueAte = 0

const alunoAtual = computed(() => alunos.value.find((a) => a.id === alunoAtualId.value) || null)
// Só alunos ativos podem ser selecionados pra um novo Registro (inativo =
// "vai voltar depois", ver aluno.service.js) - mas `alunos.value` continua
// com todo mundo, senão "Registros recentes" perde nome/foto de um Registro
// antigo de um aluno hoje inativo.
const alunosAtivos = computed(() => alunos.value.filter((a) => a.ativo))

// Fonte da verdade do Registro em edição do aluno selecionado - persistido
// desde "Iniciar registro" (docs/adr/0012), não mais um estado só em
// memória. Isso é o que permite ter um Registro em_andamento por aluno ao
// mesmo tempo (ex.: atendimento em família) sem perder progresso ao trocar.
// docs/adr/0018 - a regra da ADR-0012 passa a ser um Registro 'em_andamento'
// por aluno POR TIPO: o personal pode ter um 'atendimento' e uma
// 'avaliacao_fisica' abertos ao mesmo tempo para o mesmo aluno.
const registroEmAndamento = computed(
  () =>
    syncQueue.registrosLocais.find(
      (r) =>
        r.alunoId === alunoAtualId.value &&
        r.status === 'em_andamento' &&
        (r.tipo ?? 'atendimento') === tipoSelecionado.value
    ) ?? null
)
const estagio = computed(() => (registroEmAndamento.value ? 'composer' : 'idle'))
const podeIniciar = computed(() => Boolean(alunoAtualId.value) && !registroEmAndamento.value)
const tipoEmAndamento = computed(() => tipoMeta(registroEmAndamento.value?.tipo))
const micModo = computed(() => (composerTexto.value.trim() ? 'send' : 'mic'))
const alunosComRegistroEmAndamento = computed(
  () => new Set(syncQueue.registrosLocais.filter((r) => r.status === 'em_andamento').map((r) => r.alunoId))
)

const bannerClasse = computed(() => {
  if (!syncQueue.online) return 'state-offline'
  if (syncQueue.processando || syncQueue.pendentes.length) return 'state-pending'
  return 'state-ok'
})
const bannerTexto = computed(() => {
  const pendentes = syncQueue.pendentes.length
  if (!syncQueue.online && pendentes > 0) return `Sem conexão — ${pendentes} registro(s) salvo(s) no aparelho`
  if (!syncQueue.online) return 'Sem conexão — os próximos registros serão salvos no aparelho'
  if (pendentes > 0) return `Sincronizando ${pendentes} registro(s)…`
  return 'Tudo sincronizado'
})

const recentes = computed(() => {
  const locaisIds = new Set(syncQueue.registrosLocais.map((r) => r.id))
  const locais = syncQueue.registrosLocais.map((r) => ({
    id: r.id,
    aluno: alunos.value.find((a) => a.id === r.alunoId),
    titulo: r.titulo,
    iniciadoLabel: formatarDataHora(r.iniciadoEm),
    dataAtendimento: r.dataAtendimento,
    entradas: r.entradas,
    status: r.status,
    tipo: r.tipo
  }))
  const doServidor = registrosServidorRecentes.value
    .filter((r) => !locaisIds.has(r.id))
    .map((r) => ({
      id: r.id,
      // Prefere o registro completo de alunos.value (tem fotoUrl já
      // buscada) - o aluno embutido no Registro só traz id/nome (ver
      // registro.repository.js).
      aluno: alunos.value.find((a) => a.id === r.aluno_id) || r.aluno,
      titulo: r.titulo,
      iniciadoLabel: formatarDataHora(r.iniciado_em),
      dataAtendimento: r.data_atendimento,
      entradas: r.entradas || [],
      status: r.status,
      tipo: r.tipo
    }))
  return [...locais, ...doServidor]
})

async function carregarAlunos() {
  try {
    const lista = await alunosService.listar()
    // IndexedDB não aceita o Proxy reativo do Vue (ver db.test.js) - salva o
    // array plano ANTES de atribuir a alunos.value, não depois.
    await salvarAlunosCache(lista)
    alunos.value = lista
  } catch (_err) {
    alunos.value = await listarAlunosCache()
  }
  const salvo = localStorage.getItem(ULTIMO_ALUNO_KEY)
  alunoAtualId.value = salvo && alunosAtivos.value.some((a) => a.id === salvo) ? salvo : (alunosAtivos.value[0]?.id ?? null)
  carregarFotosAlunos()
}

// Foto de cada aluno (avatar em "Aluno selecionado", "Registros recentes" e
// no seletor) - offline ou sem foto cadastrada, cai silenciosamente para as
// iniciais (mesmo padrão de carregarFotoPropria acima). Roda em paralelo
// sem bloquear a tela, já que o app precisa continuar utilizável offline.
async function carregarFotosAlunos() {
  await Promise.all(
    alunos.value
      .filter((aluno) => aluno.foto_caminho)
      .map(async (aluno) => {
        try {
          const blob = await alunosService.obterFoto(aluno.id)
          aluno.fotoUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // offline ou sem foto disponível - fica só com as iniciais
        }
      })
  )
}

async function carregarRecentesServidor() {
  if (!syncQueue.online) return
  try {
    const lista = await registrosService.listar()
    registrosServidorRecentes.value.forEach((r) => revogarAudioUrls(r.entradas || []))
    registrosServidorRecentes.value = lista.slice(0, 8)
  } catch (_err) {
    // offline-ish ou erro de rede: a lista local já cobre o essencial
  }
}

// "Registros recentes" expandido - toca áudio de um Registro já fechado
// (local, ainda no dispositivo, ou já sincronizado no servidor). `item.entradas`
// é a mesma referência do array de origem (registrosLocais ou
// registrosServidorRecentes), então mutar `audioUrl` aqui persiste entre
// recomputes de `recentes` sem precisar de um cache à parte.
const expandidoId = ref(null)

async function alternarExpandidoRecente(item) {
  expandidoId.value = expandidoId.value === item.id ? null : item.id
  if (expandidoId.value !== item.id) return
  const local = syncQueue.registrosLocais.find((r) => r.id === item.id)
  for (const entrada of item.entradas) {
    if (entrada.tipo !== 'audio' || entrada.audioUrl) continue
    try {
      const blob = local ? await obterAudioLocal(item.id, entrada.ordem) : await registrosService.obterAudio(item.id, entrada.id)
      if (blob) entrada.audioUrl = URL.createObjectURL(blob)
    } catch (_err) {
      // sem áudio disponível - só essa entrada fica sem player
    }
  }
}

// Excluir (só não confirmados, ver docs/adr/0007) - mesmo padrão de "toque
// duas vezes" já usado em "Descartar" no composer, em vez do confirm()
// nativo do navegador.
const confirmandoExclusaoId = ref(null)
let confirmandoExclusaoTimeout = null

async function excluirRecente(item) {
  if (confirmandoExclusaoId.value !== item.id) {
    confirmandoExclusaoId.value = item.id
    clearTimeout(confirmandoExclusaoTimeout)
    confirmandoExclusaoTimeout = setTimeout(() => {
      confirmandoExclusaoId.value = null
    }, 3000)
    return
  }
  confirmandoExclusaoId.value = null
  clearTimeout(confirmandoExclusaoTimeout)

  const local = syncQueue.registrosLocais.find((r) => r.id === item.id)
  try {
    if (local) {
      revogarAudioUrls(local.entradas)
      await syncQueue.descartarRegistroLocal(item.id)
    } else {
      await registrosService.excluir(item.id)
      registrosServidorRecentes.value = registrosServidorRecentes.value.filter((r) => r.id !== item.id)
    }
    if (expandidoId.value === item.id) expandidoId.value = null
    showToast('Registro excluído.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível excluir o registro.', 'warning')
  }
}

watch(alunoAtualId, (novo) => {
  if (novo) localStorage.setItem(ULTIMO_ALUNO_KEY, novo)
})
watch(tipoSelecionado, (novo) => {
  localStorage.setItem(ULTIMO_TIPO_KEY, novo)
})

// Ao trocar de aluno (ou depois de um `carregar()` recarregar registrosLocais
// do zero, ex.: ciclo de sincronização de OUTRO Registro), garante que toda
// entrada de áudio tenha uma audioUrl utilizável: entradas gravadas nesta
// sessão já têm (encerrarGravacao já cria); entradas vindas do IndexedDB
// precisam reconstruir a partir do Blob salvo (docs/adr/0012). Reaproveita a
// audioUrl antiga por `ordem` quando é o mesmo Registro só recarregado, em
// vez de vazar a URL antiga e recriar uma nova à toa.
watch(registroEmAndamento, async (novo, antigo) => {
  if (!novo) {
    if (antigo) revogarAudioUrls(antigo.entradas)
    return
  }
  if (antigo && antigo.id !== novo.id) {
    revogarAudioUrls(antigo.entradas)
  } else if (antigo) {
    for (const entradaAntiga of antigo.entradas) {
      if (entradaAntiga.audioUrl) {
        const entradaNova = novo.entradas.find((e) => e.ordem === entradaAntiga.ordem)
        if (entradaNova) entradaNova.audioUrl = entradaAntiga.audioUrl
      }
    }
  }
  for (const entrada of novo.entradas) {
    if (entrada.tipo === 'audio' && !entrada.audioUrl) {
      const blob = await obterAudioLocal(novo.id, entrada.ordem)
      if (blob) entrada.audioUrl = URL.createObjectURL(blob)
    }
  }
})

onMounted(async () => {
  syncQueue.iniciarMotor()
  await carregarAlunos()
  await carregarRecentesServidor()
})

// Avatar do personal na topbar (mesmo padrão de AdminShell.vue) - se
// estiver offline, a busca do blob falha silenciosamente e fica só com as
// iniciais (auth.usuario?.foto_caminho já vem do login, cacheado).
const fotoUrl = ref(null)
async function carregarFotoPropria() {
  if (fotoUrl.value) {
    URL.revokeObjectURL(fotoUrl.value)
    fotoUrl.value = null
  }
  if (!auth.usuario?.foto_caminho) return
  try {
    const blob = await usuariosService.obterFotoPropria()
    fotoUrl.value = URL.createObjectURL(blob)
  } catch (_err) {
    // offline ou sem foto - fica só com as iniciais
  }
}
onMounted(carregarFotoPropria)
watch(() => auth.usuario?.foto_caminho, carregarFotoPropria)

onBeforeUnmount(() => {
  clearInterval(cronometroInterval)
  gravador.cancelar()
  syncQueue.registrosLocais.forEach((r) => revogarAudioUrls(r.entradas))
  registrosServidorRecentes.value.forEach((r) => revogarAudioUrls(r.entradas || []))
  if (fotoUrl.value) URL.revokeObjectURL(fotoUrl.value)
  alunos.value.forEach((aluno) => {
    if (aluno.fotoUrl) URL.revokeObjectURL(aluno.fotoUrl)
  })
})

// Object URLs de áudio só existem em memória, presas à sessão da página -
// precisam ser revogadas explicitamente (remover entrada, descartar,
// finalizar, trocar de aluno ou desmontar) para não vazar memória.
function revogarAudioUrls(entradas) {
  entradas.forEach((entrada) => {
    if (entrada.tipo === 'audio' && entrada.audioUrl) URL.revokeObjectURL(entrada.audioUrl)
  })
}

// `ordem` nunca é reindexada depois de removida uma entrada (ver
// docs/adr/0012) - o Blob de áudio já foi persistido sob a `ordem` original,
// e o backend só usa `ordem` como critério relativo de ordenação/chave de
// mapeamento, não como sequência contígua. Por isso a próxima entrada usa o
// maior `ordem` existente + 1, nunca `entradas.length`.
function proximaOrdem(entradas) {
  return entradas.length ? Math.max(...entradas.map((e) => e.ordem)) + 1 : 0
}

function abrirSheet() {
  sheetAberto.value = true
}
function selecionarAluno(id) {
  alunoAtualId.value = id
  sheetAberto.value = false
}

async function iniciarRegistro() {
  if (!alunoAtualId.value || registroEmAndamento.value) return
  const registro = {
    id: gerarUuid(),
    alunoId: alunoAtualId.value,
    titulo: registroTituloInput.value.trim(),
    tipo: tipoSelecionado.value,
    iniciadoEm: new Date().toISOString(),
    // docs/adr/0019 - default hoje; ajustável no composer (só atendimento).
    dataAtendimento: hojeYmd(),
    status: 'em_andamento',
    entradas: []
  }
  registroTituloInput.value = ''
  try {
    await syncQueue.salvarLocal(registro)
  } catch (err) {
    relatarErro('iniciar-registro', err)
    showToast('Não foi possível iniciar o registro. Tente novamente.', 'warning')
  }
}

// docs/adr/0019 - data do atendimento, ajustável no composer enquanto o
// Registro está em andamento (mesma janela de 7 dias da captura). Depois de
// finalizado, só o desktop altera.
async function definirDataAtendimento(ymd) {
  const registro = registroEmAndamento.value
  if (!registro || registro.dataAtendimento === ymd) return
  registro.dataAtendimento = ymd
  try {
    await syncQueue.salvarLocal(registro)
  } catch (err) {
    relatarErro('data-atendimento', err)
    showToast('Não foi possível alterar a data. Tente novamente.', 'warning')
  }
}

async function adicionarTexto() {
  const valor = composerTexto.value.trim()
  const registro = registroEmAndamento.value
  if (!valor || !registro) return
  registro.entradas.push({ ordem: proximaOrdem(registro.entradas), tipo: 'texto', conteudoTexto: valor })
  composerTexto.value = ''
  try {
    await syncQueue.salvarLocal(registro)
  } catch (err) {
    relatarErro('salvar-texto', err)
    showToast('Não foi possível salvar o texto. Tente novamente.', 'warning')
  }
}

async function removerEntrada(indice) {
  const registro = registroEmAndamento.value
  if (!registro) return
  const [removida] = registro.entradas.splice(indice, 1)
  try {
    if (removida.tipo === 'audio') {
      if (removida.audioUrl) URL.revokeObjectURL(removida.audioUrl)
      await removerAudioLocal(registro.id, removida.ordem)
    }
    await syncQueue.salvarLocal(registro)
  } catch (err) {
    relatarErro('remover-entrada', err)
    showToast('Não foi possível remover a entrada. Tente novamente.', 'warning')
  }
}

// --- gravação de voz (docs/adr/0021) --------------------------------------

function tickCronometro() {
  const decorridoMs = relogioGravacao.decorridoMs()
  cronometro.value = formatarCronometro(decorridoMs)
  if (!gravacaoLonga.value && estadoDuracao(decorridoMs) === 'longa') {
    gravacaoLonga.value = true
    navigator.vibrate?.(30)
  }
}

function iniciarCronometro() {
  relogioGravacao.iniciar()
  cronometro.value = '0:00'
  gravacaoLonga.value = false
  gravacaoPausada.value = false
  clearInterval(cronometroInterval)
  cronometroInterval = setInterval(tickCronometro, 200)
}

// pausa/retoma no modo travado (docs/adr/0021) - o cronômetro só conta tempo
// ativo; o áudio final continua contínuo, sem o trecho pausado.
function alternarPausa() {
  if (micEstado.value !== 'travado') return
  if (gravacaoPausada.value) {
    gravador.retomar()
    relogioGravacao.retomar()
    gravacaoPausada.value = false
    clearInterval(cronometroInterval)
    cronometroInterval = setInterval(tickCronometro, 200)
  } else {
    gravador.pausar()
    relogioGravacao.pausar()
    gravacaoPausada.value = true
    clearInterval(cronometroInterval)
    tickCronometro()
  }
}

async function iniciarGravacao() {
  try {
    await gravador.iniciar()
  } catch (err) {
    const nome = relatarErro('microfone', err)
    encerrarGravacao({ salvar: false })
    showToast(`Não foi possível acessar o microfone (${nome}).`, 'warning')
  }
}

// Fecha o ciclo: para o cronômetro, volta ao estado idle e - se `salvar` -
// persiste o áudio como entrada. `salvar: false` apenas descarta.
async function encerrarGravacao({ salvar }) {
  if (micEstado.value === 'idle') return
  const decorridoMs = relogioGravacao.decorridoMs()
  micEstado.value = 'idle'
  clearInterval(cronometroInterval)
  gravacaoLonga.value = false
  gravacaoPausada.value = false
  travarProgresso.value = 0
  gestoPointerId = null

  if (!salvar) {
    gravador.cancelar()
    return
  }
  const resultado = await gravador.parar()
  const registro = registroEmAndamento.value
  if (!resultado || decorridoMs < DURACAO_MINIMA_MS || !registro) return
  const ordem = proximaOrdem(registro.entradas)
  try {
    await salvarAudioLocal(registro.id, ordem, resultado.blob)
    registro.entradas.push({
      ordem,
      tipo: 'audio',
      duracaoSegundos: Math.round(decorridoMs / 1000),
      audioUrl: URL.createObjectURL(resultado.blob)
    })
    await syncQueue.salvarLocal(registro)
  } catch (err) {
    const nome = relatarErro('salvar-audio', err)
    showToast(`Não foi possível salvar o áudio (${nome}).`, 'warning')
  }
}

// pointerdown no microfone: começa a gravar. Mouse já entra travado (segurar
// o botão do mouse pra gravar é estranho no desktop); toque entra em
// "segurando" e o gesto de arraste decide se trava.
function onMicPointerdown(evento) {
  if (micModo.value === 'send' || micEstado.value !== 'idle') return
  evento.preventDefault()
  gestoPointerId = evento.pointerId
  gestoOrigemY = evento.clientY
  travarProgresso.value = 0
  try {
    evento.currentTarget.setPointerCapture?.(evento.pointerId)
  } catch (_e) { /* sem captura: segue mesmo assim */ }
  micEstado.value = evento.pointerType === 'mouse' ? 'travado' : 'segurando'
  // engole o clique-fantasma que o próprio pointerdown/up gera (senão, no
  // mouse, o mesmo clique que começa já dispararia "enviar").
  suprimirCliqueAte = Date.now() + 600
  iniciarCronometro()
  iniciarGravacao()
}

function onMicPointermove(evento) {
  if (micEstado.value !== 'segurando' || evento.pointerId !== gestoPointerId) return
  const dy = evento.clientY - gestoOrigemY
  travarProgresso.value = progressoTravar(dy)
  if (resolverGesto({ dy }) === 'travar') {
    micEstado.value = 'travado'
    travarProgresso.value = 1
    suprimirCliqueAte = Date.now() + 600
    try {
      evento.currentTarget.releasePointerCapture?.(evento.pointerId)
    } catch (_e) { /* noop */ }
  }
}

function onMicPointerup(evento) {
  if (evento.pointerId !== gestoPointerId) return
  try {
    evento.currentTarget.releasePointerCapture?.(evento.pointerId)
  } catch (_e) { /* noop */ }
  // soltou ainda em "segurando" => envia. Já travado, soltar não faz nada.
  if (micEstado.value === 'segurando') encerrarGravacao({ salvar: true })
}

// teclado: não dá pra "segurar" uma tecla de forma útil - Enter/Espaço
// inicia já travado (encerra pelos botões lixeira / enviar).
function onMicKeydown(evento) {
  if (micModo.value === 'send') return
  if (evento.key !== 'Enter' && evento.key !== ' ' && evento.key !== 'Spacebar') return
  evento.preventDefault()
  if (micEstado.value !== 'idle') return
  micEstado.value = 'travado'
  iniciarCronometro()
  iniciarGravacao()
}

function onMicClick() {
  if (micModo.value === 'send' && micEstado.value === 'idle') adicionarTexto()
}

// engole o clique-fantasma que segue "soltar o dedo" logo depois de travar
// pelo arraste, pra não disparar "enviar" sem querer.
function onComposerClickCapture(evento) {
  if (Date.now() < suprimirCliqueAte) {
    evento.stopPropagation()
    evento.preventDefault()
    suprimirCliqueAte = 0
  }
}

const dicaGravacao = computed(() => {
  if (micEstado.value === 'idle') return ''
  if (gravacaoPausada.value) return 'Gravação pausada — toque em retomar'
  if (gravacaoLonga.value) return 'Gravação longa (3 min)'
  if (micEstado.value === 'travado') return 'Gravando — toque em enviar para encerrar'
  return 'Ouvindo… solte para enviar, arraste ↑ para travar'
})

const botaoMicLabel = computed(() => {
  if (micEstado.value === 'travado') return 'Enviar áudio'
  if (micModo.value === 'send') return 'Enviar texto'
  return 'Gravar áudio: segure para gravar, arraste para cima para travar'
})

async function finalizarRegistro() {
  const registro = registroEmAndamento.value
  if (!registro.entradas.length) {
    showToast('Adicione ao menos um áudio ou texto antes de finalizar.', 'warning')
    return
  }

  revogarAudioUrls(registro.entradas)
  registro.status = 'pendente_sincronizacao'
  await syncQueue.salvarLocal(registro)
  // dispara já, sem travar a UI esperando a rede; só ao terminar (sucesso ou
  // falha) é que atualizamos o snapshot do servidor - se o GET rodasse em
  // paralelo com o POST de sincronização, corria o risco de responder antes
  // do registro existir no servidor, deixando o item sumir da lista até um
  // refresh manual da página (o local já foi removido, o servidor ainda não
  // tinha o dado no momento da consulta).
  syncQueue.processarFila().then(() => carregarRecentesServidor())
  showToast(
    syncQueue.online ? 'Registro salvo. Sincronizando…' : 'Registro salvo no dispositivo. Será sincronizado quando houver conexão.',
    syncQueue.online ? 'success' : 'warning'
  )
}

async function descartar() {
  if (!discardConfirmando.value) {
    discardConfirmando.value = true
    setTimeout(() => {
      discardConfirmando.value = false
    }, 3000)
    return
  }
  discardConfirmando.value = false
  gravador.cancelar()
  clearInterval(cronometroInterval)
  micEstado.value = 'idle'
  gravacaoLonga.value = false
  gravacaoPausada.value = false
  travarProgresso.value = 0
  const registro = registroEmAndamento.value
  if (registro) {
    revogarAudioUrls(registro.entradas)
    await syncQueue.descartarRegistroLocal(registro.id)
  }
  showToast('Registro descartado.', 'neutral')
}
</script>

<template>
  <div class="captura-screen">
    <div class="app-topbar">
      <div v-if="auth.usuario?.equipe?.nome || auth.usuario?.nome" class="topbar-meta-group">
        <img v-if="fotoUrl" :src="fotoUrl" class="avatar" alt="" />
        <span v-else class="avatar" :style="{ background: corParaId(auth.usuario?.id) }">{{ iniciais(auth.usuario?.nome) }}</span>
        <div class="topbar-meta">
          <span v-if="auth.usuario?.equipe?.nome" class="topbar-meta-line">{{ auth.usuario.equipe.nome }}</span>
          <span v-if="auth.usuario?.nome" class="topbar-meta-line">{{ auth.usuario.nome }}</span>
        </div>
      </div>
      <div class="topbar-actions">
        <router-link class="icon-btn" to="/admin" title="Painel admin">🖥️</router-link>
        <button class="icon-btn" type="button" title="Sair" @click="auth.logout(); $router.replace('/login')">🚪</button>
      </div>
    </div>

    <div class="student-bar">
      <button class="current-student" type="button" @click="abrirSheet">
        <img v-if="alunoAtual?.fotoUrl" :src="alunoAtual.fotoUrl" class="avatar" alt="" />
        <span v-else-if="alunoAtual" class="avatar" :style="{ background: corParaId(alunoAtual.id) }">{{ iniciais(alunoAtual.nome) }}</span>
        <span class="current-student-info">
          <span class="current-student-label">Aluno selecionado</span>
          <span class="current-student-name">{{ alunoAtual ? alunoAtual.nome : 'Selecionar aluno' }}<span class="current-student-caret">▾</span></span>
        </span>
      </button>
    </div>

    <div class="stage">
      <!-- ===================== tela ociosa: iniciar registro ===================== -->
      <template v-if="estagio === 'idle'">
        <div class="idle-view">
          <template v-if="!alunosAtivos.length">
            <p class="idle-title">Nenhum aluno cadastrado</p>
            <p class="idle-subtitle">Cadastre um aluno no painel desktop antes de iniciar um registro.</p>
          </template>
          <template v-else>
            <div class="idle-icons">🎙️ ⌨️</div>
            <p class="idle-title">
              {{ tipoSelecionado === 'avaliacao_fisica' ? 'Nova avaliação física' : 'Pronto para registrar?' }}
            </p>
            <p class="idle-subtitle">
              {{
                tipoSelecionado === 'avaliacao_fisica'
                  ? 'Grave as medidas que você coletou. A IA organiza; você confere e confirma antes de salvar.'
                  : 'Inicie um registro e adicione quantos áudios ou textos quiser — treino, observação, o que precisar.'
              }}
            </p>

            <div class="tipo-picker" role="group" aria-label="Tipo de registro">
              <button
                type="button"
                class="tipo-opt"
                :class="{ ativo: tipoSelecionado === 'atendimento' }"
                @click="tipoSelecionado = 'atendimento'"
              >
                <span class="tipo-opt-icone">📝</span>
                <span class="tipo-opt-nome">Atendimento</span>
                <span class="tipo-opt-desc">treino, observação</span>
              </button>
              <button
                type="button"
                class="tipo-opt tipo-opt-avaliacao"
                :class="{ ativo: tipoSelecionado === 'avaliacao_fisica' }"
                @click="tipoSelecionado = 'avaliacao_fisica'"
              >
                <span class="tipo-opt-icone">📏</span>
                <span class="tipo-opt-nome">Avaliação física</span>
                <span class="tipo-opt-desc">medidas coletadas</span>
              </button>
            </div>

            <input
              v-model="registroTituloInput"
              class="registro-title-input"
              :placeholder="tipoSelecionado === 'avaliacao_fisica' ? 'Nota da avaliação (opcional)' : 'Título do registro (opcional)'"
              aria-label="Título do registro (opcional)"
              @keydown.enter="iniciarRegistro"
            />
            <button
              class="start-registro-btn"
              :class="{ 'start-registro-btn-avaliacao': tipoSelecionado === 'avaliacao_fisica' }"
              type="button"
              :disabled="!podeIniciar"
              @click="iniciarRegistro"
            >
              ▶ {{ tipoSelecionado === 'avaliacao_fisica' ? 'Iniciar avaliação' : 'Iniciar registro' }}
            </button>
            <p v-if="alunoAtual && !podeIniciar" class="idle-em-andamento">
              Já existe {{ tipoSelecionado === 'avaliacao_fisica' ? 'uma avaliação' : 'um registro' }} em andamento para {{ alunoAtual.nome }}.
            </p>
          </template>
        </div>

        <div class="recent-panel">
          <div class="recent-panel-handle"></div>
          <div class="recent-panel-title">
            <span>Registros recentes</span>
            <button class="sync-banner" :class="bannerClasse" type="button" @click="syncQueue.processarFila()">
              <span class="sync-banner-dot"></span>
              <span>{{ bannerTexto }}</span>
            </button>
            <span class="badge badge-neutral">{{ recentes.length }}</span>
          </div>
          <div class="recent-list">
            <div v-if="!recentes.length" class="recent-item-empty">Nenhum registro ainda hoje.</div>
            <div v-for="item in recentes" :key="item.id" class="recent-item-wrap">
              <button class="recent-item" type="button" @click="alternarExpandidoRecente(item)">
                <img v-if="item.aluno?.fotoUrl" :src="item.aluno.fotoUrl" class="recent-item-avatar" alt="" />
                <span v-else class="recent-item-avatar" :style="{ background: item.aluno ? corParaId(item.aluno.id) : '#9ca3af' }">
                  {{ item.aluno ? iniciais(item.aluno.nome) : '?' }}
                </span>
                <span class="recent-item-body">
                  <span class="recent-item-nome">
                    {{ item.aluno ? item.aluno.nome : 'Aluno' }}
                    <span v-if="item.tipo === 'avaliacao_fisica'" class="recent-item-tipo">{{ tipoMeta(item.tipo).icon }} {{ tipoMeta(item.tipo).chip }}</span>
                  </span>
                  <span v-if="item.titulo" class="recent-item-titulo">{{ item.titulo }}</span>
                  <span class="recent-item-iniciado">
                    <template v-if="item.tipo !== 'avaliacao_fisica' && item.dataAtendimento">Atendimento {{ rotuloDataAtendimento(item.dataAtendimento, { curto: true }) }} · </template>registrado {{ item.iniciadoLabel }}
                  </span>
                </span>
                <span class="recent-item-meta">
                  <span class="recent-item-resumo">{{ resumoEntradas(item.entradas) }}</span>
                  <span class="recent-item-status-icon" :class="'badge-' + statusMeta(item.status).badge" :title="statusMeta(item.status).label">
                    {{ statusMeta(item.status).icon }}
                  </span>
                </span>
              </button>
              <div v-if="expandidoId === item.id" class="recent-item-entradas">
                <div v-for="entrada in item.entradas" :key="entrada.ordem ?? entrada.id" class="recent-entry">
                  <span class="recent-entry-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
                  <span class="recent-entry-body">
                    <span v-if="entrada.tipo === 'audio'" class="recent-entry-text">Áudio<template v-if="entrada.duracaoSegundos"> · {{ entrada.duracaoSegundos }}s</template></span>
                    <span v-else class="recent-entry-text">{{ entrada.conteudoTexto || 'Texto' }}</span>
                    <audio v-if="entrada.audioUrl" :src="entrada.audioUrl" controls class="recent-entry-audio"></audio>
                  </span>
                </div>
                <button
                  v-if="item.status !== 'confirmado'"
                  type="button"
                  class="recent-delete-btn"
                  :class="{ confirming: confirmandoExclusaoId === item.id }"
                  @click="excluirRecente(item)"
                >
                  {{ confirmandoExclusaoId === item.id ? 'Toque p/ confirmar exclusão' : '🗑️ Excluir registro' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ===================== registro aberto: composer ===================== -->
      <template v-else>
        <div class="composer-view" :class="{ 'tipo-avaliacao': registroEmAndamento.tipo === 'avaliacao_fisica' }">
          <div class="registro-header">
            <span class="registro-header-dot"></span>
            <span class="registro-header-body">
              <span class="registro-header-title">
                {{ registroEmAndamento.tipo === 'avaliacao_fisica' ? 'Avaliação física' : 'Registro aberto' }} — {{ alunoAtual?.nome }}{{ registroEmAndamento.titulo ? ' · ' + registroEmAndamento.titulo : '' }}
              </span>
              <span class="registro-header-sub">{{ registroEmAndamento.entradas.length }} entrada(s)</span>
            </span>
            <button class="registro-header-close" type="button" title="Descartar registro" @click="descartar">✕</button>
          </div>

          <RoteiroDitado v-if="registroEmAndamento.tipo === 'avaliacao_fisica'" />
          <SeletorDataAtendimento
            v-else
            :model-value="registroEmAndamento.dataAtendimento"
            @update:model-value="definirDataAtendimento"
          />

          <div class="entries-scroll">
            <div v-if="!registroEmAndamento.entradas.length" class="entries-empty">
              {{
                registroEmAndamento.tipo === 'avaliacao_fisica'
                  ? 'Segure o microfone e dite as medidas — arraste ↑ para travar —, ou digite abaixo.'
                  : 'Segure o microfone para gravar — arraste ↑ para travar —, ou digite um texto abaixo.'
              }}
            </div>
            <div v-for="(entrada, indice) in registroEmAndamento.entradas" :key="entrada.ordem" class="entry-bubble" :class="entrada.tipo">
              <span class="entry-bubble-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
              <span class="entry-bubble-body">
                <span class="entry-bubble-label">{{ entrada.tipo === 'audio' ? 'Áudio' : 'Texto' }}</span>
                <span v-if="entrada.tipo === 'audio'" class="entry-bubble-content">Áudio gravado · {{ entrada.duracaoSegundos }}s</span>
                <span v-else class="entry-bubble-content">{{ entrada.conteudoTexto }}</span>
                <audio v-if="entrada.tipo === 'audio' && entrada.audioUrl" class="entry-bubble-audio" :src="entrada.audioUrl" controls></audio>
              </span>
              <button class="entry-bubble-remove" type="button" title="Remover entrada" @click="removerEntrada(indice)">✕</button>
            </div>
          </div>

          <div class="composer-row" :class="'mic-' + micEstado" @click.capture="onComposerClickCapture">
            <!-- trilho do cadeado: aparece enquanto segura, antes de travar (docs/adr/0021) -->
            <div v-if="micEstado === 'segurando'" class="lock-track" :style="{ '--prog': travarProgresso }" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="lock-chevron"><path d="m7 14 5-5 5 5" /></svg>
              <svg v-if="travarProgresso < 1" viewBox="0 0 24 24" class="lock-ic">
                <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" />
              </svg>
              <svg v-else viewBox="0 0 24 24" class="lock-ic locked">
                <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>

            <template v-if="micEstado === 'idle'">
              <div class="composer-input-wrap">
                <input
                  v-model="composerTexto"
                  class="composer-input"
                  :placeholder="registroEmAndamento.tipo === 'avaliacao_fisica' ? 'Dite ou digite as medidas…' : 'Adicionar texto ao registro…'"
                  aria-label="Adicionar texto ao registro"
                  @keydown.enter.prevent="adicionarTexto"
                />
              </div>
            </template>

            <template v-else>
              <button
                v-if="micEstado === 'travado'"
                class="rec-trash"
                type="button"
                aria-label="Descartar gravação"
                @click="encerrarGravacao({ salvar: false })"
              >
                <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
              </button>
              <div class="composer-recording active" :class="{ longa: gravacaoLonga, travado: micEstado === 'travado', pausada: gravacaoPausada }">
                <span class="rec-dot" aria-hidden="true"></span>
                <span v-if="gravacaoPausada" class="composer-recording-text">Pausado</span>
                <span v-else-if="micEstado === 'travado'" class="rec-wave" aria-hidden="true"><i v-for="n in 15" :key="n"></i></span>
                <span v-else class="composer-recording-text">{{ gravacaoLonga ? 'Gravação longa (3 min)' : 'Solte p/ enviar · arraste ↑ trava' }}</span>
                <span class="composer-recording-timer">{{ cronometro }}</span>
              </div>
              <button
                v-if="micEstado === 'travado' && suportaPausa"
                class="rec-pause"
                type="button"
                :aria-label="gravacaoPausada ? 'Retomar gravação' : 'Pausar gravação'"
                @click="alternarPausa"
              >
                <svg v-if="gravacaoPausada" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                <svg v-else viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              </button>
            </template>

            <button
              class="mic-send-btn"
              type="button"
              :class="{ recording: micEstado === 'segurando', 'is-send': micEstado === 'travado' || micModo === 'send' }"
              :aria-label="botaoMicLabel"
              @pointerdown="onMicPointerdown"
              @pointermove="onMicPointermove"
              @pointerup="onMicPointerup"
              @pointercancel="onMicPointerup"
              @contextmenu.prevent
              @click="micEstado === 'travado' ? encerrarGravacao({ salvar: true }) : onMicClick()"
              @keydown="onMicKeydown"
            >
              <svg v-if="micEstado === 'travado' || micModo === 'send'" viewBox="0 0 24 24" class="ic-send">
                <path d="M3 11.5 20 4l-6 17-2.6-7.4L3 11.5Z" />
              </svg>
              <svg v-else viewBox="0 0 24 24" class="ic-mic">
                <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
              </svg>
            </button>

            <p class="visually-hidden" aria-live="polite">{{ dicaGravacao }}</p>
          </div>

          <div class="composer-actions">
            <button class="discard-btn" type="button" :class="{ confirming: discardConfirmando }" @click="descartar">
              {{ discardConfirmando ? 'Toque p/ confirmar' : 'Descartar' }}
            </button>
            <button class="finalize-btn" type="button" @click="finalizarRegistro">✓ Finalizar registro</button>
          </div>
        </div>
      </template>
    </div>

    <ToastStack :toasts="toasts" />
    <AlunoSheet
      :aberto="sheetAberto"
      :alunos="alunosAtivos"
      :aluno-atual-id="alunoAtualId"
      :equipe-nome="auth.usuario?.equipe?.nome"
      :em-andamento-ids="alunosComRegistroEmAndamento"
      @fechar="sheetAberto = false"
      @selecionar="selecionarAluno"
    />
  </div>
</template>
