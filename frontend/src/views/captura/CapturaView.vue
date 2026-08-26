<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAuthStore } from '../../stores/auth.store.js'
import { useSyncQueueStore } from '../../stores/syncQueue.store.js'
import alunosService from '../../services/alunos.service.js'
import registrosService from '../../services/registros.service.js'
import { salvarAlunosCache, listarAlunosCache, salvarAudioLocal, removerAudioLocal, obterAudioLocal } from '../../offline/db.js'
import { criarGravador } from '../../offline/recorder.js'
import { useToasts } from '../../composables/useToasts.js'
import { statusMeta, resumoEntradas, corParaId, iniciais, formatarDataHora } from '../../utils/registroStatus.js'
import { gerarUuid } from '../../utils/uuid.js'
import AlunoSheet from '../../components/AlunoSheet.vue'
import ToastStack from '../../components/ToastStack.vue'

const ULTIMO_ALUNO_KEY = 'personal_assistant_ultimo_aluno'

const auth = useAuthStore()
const syncQueue = useSyncQueueStore()
const { toasts, showToast } = useToasts()
const gravador = criarGravador()

const alunos = ref([])
const alunoAtualId = ref(null)
const sheetAberto = ref(false)
const registroTituloInput = ref('')
const composerTexto = ref('')
const gravando = ref(false)
const cronometro = ref('0:00')
const discardConfirmando = ref(false)
const registrosServidorRecentes = ref([])

let recordStart = 0
let cronometroInterval = null

const alunoAtual = computed(() => alunos.value.find((a) => a.id === alunoAtualId.value) || null)

// Fonte da verdade do Registro em edição do aluno selecionado - persistido
// desde "Iniciar registro" (docs/adr/0012), não mais um estado só em
// memória. Isso é o que permite ter um Registro em_andamento por aluno ao
// mesmo tempo (ex.: atendimento em família) sem perder progresso ao trocar.
const registroEmAndamento = computed(() =>
  syncQueue.registrosLocais.find((r) => r.alunoId === alunoAtualId.value && r.status === 'em_andamento') ?? null
)
const estagio = computed(() => (registroEmAndamento.value ? 'composer' : 'idle'))
const podeIniciar = computed(() => Boolean(alunoAtualId.value) && !registroEmAndamento.value)
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
    entradas: r.entradas,
    status: r.status
  }))
  const doServidor = registrosServidorRecentes.value
    .filter((r) => !locaisIds.has(r.id))
    .map((r) => ({
      id: r.id,
      aluno: r.aluno,
      titulo: r.titulo,
      iniciadoLabel: formatarDataHora(r.iniciado_em),
      entradas: r.entradas || [],
      status: r.status
    }))
  return [...locais, ...doServidor]
})

async function carregarAlunos() {
  try {
    const lista = await alunosService.listar()
    alunos.value = lista
    await salvarAlunosCache(lista)
  } catch (_err) {
    alunos.value = await listarAlunosCache()
  }
  const salvo = localStorage.getItem(ULTIMO_ALUNO_KEY)
  alunoAtualId.value = salvo && alunos.value.some((a) => a.id === salvo) ? salvo : (alunos.value[0]?.id ?? null)
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

// Ao trocar de aluno (ou depois de um `carregar()` recarregar registrosLocais
// do zero, ex.: ciclo de sincronização de OUTRO Registro), garante que toda
// entrada de áudio tenha uma audioUrl utilizável: entradas gravadas nesta
// sessão já têm (pararGravacao já cria); entradas vindas do IndexedDB
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

onBeforeUnmount(() => {
  clearInterval(cronometroInterval)
  gravador.cancelar()
  syncQueue.registrosLocais.forEach((r) => revogarAudioUrls(r.entradas))
  registrosServidorRecentes.value.forEach((r) => revogarAudioUrls(r.entradas || []))
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
    iniciadoEm: new Date().toISOString(),
    status: 'em_andamento',
    entradas: []
  }
  registroTituloInput.value = ''
  try {
    await syncQueue.salvarLocal(registro)
  } catch (_err) {
    showToast('Não foi possível iniciar o registro. Tente novamente.', 'warning')
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
  } catch (_err) {
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
  } catch (_err) {
    showToast('Não foi possível remover a entrada. Tente novamente.', 'warning')
  }
}

function formatarDecorrido(ms) {
  const totalSeg = Math.floor(ms / 1000)
  const m = Math.floor(totalSeg / 60)
  const s = totalSeg % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

async function iniciarGravacao(evento) {
  if (micModo.value === 'send' || gravando.value) return
  evento.preventDefault?.()
  gravando.value = true
  recordStart = Date.now()
  cronometro.value = '0:00'
  cronometroInterval = setInterval(() => {
    cronometro.value = formatarDecorrido(Date.now() - recordStart)
  }, 100)
  try {
    await gravador.iniciar()
  } catch (_err) {
    gravando.value = false
    clearInterval(cronometroInterval)
    showToast('Não foi possível acessar o microfone.', 'warning')
  }
}

async function pararGravacao() {
  if (!gravando.value) return
  gravando.value = false
  clearInterval(cronometroInterval)
  const elapsedMs = Date.now() - recordStart
  const resultado = await gravador.parar()
  const registro = registroEmAndamento.value
  if (!resultado || elapsedMs < 400 || !registro) return
  const ordem = proximaOrdem(registro.entradas)
  try {
    await salvarAudioLocal(registro.id, ordem, resultado.blob)
    registro.entradas.push({
      ordem,
      tipo: 'audio',
      duracaoSegundos: Math.round(elapsedMs / 1000),
      audioUrl: URL.createObjectURL(resultado.blob)
    })
    await syncQueue.salvarLocal(registro)
  } catch (_err) {
    showToast('Não foi possível salvar o áudio. Tente novamente.', 'warning')
  }
}

function onMicClick() {
  if (micModo.value === 'send') adicionarTexto()
}

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
  gravando.value = false
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
      <div v-if="auth.usuario?.equipe?.nome || auth.usuario?.nome" class="topbar-meta">
        <span v-if="auth.usuario?.equipe?.nome" class="topbar-meta-line">{{ auth.usuario.equipe.nome }}</span>
        <span v-if="auth.usuario?.nome" class="topbar-meta-line">{{ auth.usuario.nome }}</span>
      </div>
      <div class="topbar-actions">
        <router-link class="icon-btn" to="/admin" title="Painel admin">🖥️</router-link>
        <button class="icon-btn" type="button" title="Sair" @click="auth.logout(); $router.replace('/login')">🚪</button>
      </div>
    </div>

    <div class="student-bar">
      <button class="current-student" type="button" @click="abrirSheet">
        <span v-if="alunoAtual" class="avatar" :style="{ background: corParaId(alunoAtual.id) }">{{ iniciais(alunoAtual.nome) }}</span>
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
          <template v-if="!alunos.length">
            <p class="idle-title">Nenhum aluno cadastrado</p>
            <p class="idle-subtitle">Cadastre um aluno no painel desktop antes de iniciar um registro.</p>
          </template>
          <template v-else>
            <div class="idle-icons">🎙️ ⌨️</div>
            <p class="idle-title">Pronto para registrar?</p>
            <p class="idle-subtitle">Inicie um registro e adicione quantos áudios ou textos quiser — treino, avaliação, observação, o que precisar.</p>
            <input
              v-model="registroTituloInput"
              class="registro-title-input"
              placeholder="Título do registro (opcional)"
              aria-label="Título do registro (opcional)"
              @keydown.enter="iniciarRegistro"
            />
            <button class="start-registro-btn" type="button" :disabled="!podeIniciar" @click="iniciarRegistro">▶ Iniciar registro</button>
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
                <span class="recent-item-avatar" :style="{ background: item.aluno ? corParaId(item.aluno.id) : '#9ca3af' }">
                  {{ item.aluno ? iniciais(item.aluno.nome) : '?' }}
                </span>
                <span class="recent-item-body">
                  <span class="recent-item-nome">{{ item.aluno ? item.aluno.nome : 'Aluno' }}</span>
                  <span v-if="item.titulo" class="recent-item-titulo">{{ item.titulo }}</span>
                  <span class="recent-item-iniciado">Iniciado {{ item.iniciadoLabel }}</span>
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
        <div class="composer-view">
          <div class="registro-header">
            <span class="registro-header-dot"></span>
            <span class="registro-header-body">
              <span class="registro-header-title">Registro aberto — {{ alunoAtual?.nome }}{{ registroEmAndamento.titulo ? ' · ' + registroEmAndamento.titulo : '' }}</span>
              <span class="registro-header-sub">{{ registroEmAndamento.entradas.length }} entrada(s)</span>
            </span>
            <button class="registro-header-close" type="button" title="Descartar registro" @click="descartar">✕</button>
          </div>

          <div class="entries-scroll">
            <div v-if="!registroEmAndamento.entradas.length" class="entries-empty">
              Toque e segure o microfone para gravar, ou digite um texto abaixo.
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

          <div class="composer-row">
            <div class="composer-input-wrap">
              <input
                v-show="!gravando"
                v-model="composerTexto"
                class="composer-input"
                placeholder="Adicionar texto ao registro…"
                aria-label="Adicionar texto ao registro"
                @keydown.enter.prevent="adicionarTexto"
              />
              <div class="composer-recording" :class="{ active: gravando }">
                <span class="composer-recording-text">Ouvindo… solte para enviar</span>
                <span class="composer-recording-timer">{{ cronometro }}</span>
              </div>
            </div>
            <button
              class="mic-send-btn"
              type="button"
              :class="{ recording: gravando }"
              @pointerdown="iniciarGravacao"
              @pointerup="pararGravacao"
              @pointerleave="gravando && pararGravacao()"
              @pointercancel="gravando && pararGravacao()"
              @contextmenu.prevent
              @click="onMicClick"
            >
              {{ micModo === 'send' ? '➤' : '🎙️' }}
            </button>
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
      :alunos="alunos"
      :aluno-atual-id="alunoAtualId"
      :equipe-nome="auth.usuario?.equipe?.nome"
      :em-andamento-ids="alunosComRegistroEmAndamento"
      @fechar="sheetAberto = false"
      @selecionar="selecionarAluno"
    />
  </div>
</template>
