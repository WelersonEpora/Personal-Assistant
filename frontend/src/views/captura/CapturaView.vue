<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAuthStore } from '../../stores/auth.store.js'
import { useSyncQueueStore } from '../../stores/syncQueue.store.js'
import alunosService from '../../services/alunos.service.js'
import registrosService from '../../services/registros.service.js'
import { salvarAlunosCache, listarAlunosCache, salvarAudioLocal } from '../../offline/db.js'
import { criarGravador } from '../../offline/recorder.js'
import { useToasts } from '../../composables/useToasts.js'
import { statusMeta, resumoEntradas, corParaId, iniciais, formatarHora } from '../../utils/registroStatus.js'
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
const estagio = ref('idle') // 'idle' | 'composer'
const registroTituloInput = ref('')
const activeRegistro = ref(null)
const composerTexto = ref('')
const gravando = ref(false)
const cronometro = ref('0:00')
const discardConfirmando = ref(false)
const registrosServidorRecentes = ref([])

let recordStart = 0
let cronometroInterval = null

const alunoAtual = computed(() => alunos.value.find((a) => a.id === alunoAtualId.value) || null)
const podeIniciar = computed(() => Boolean(alunoAtualId.value) && !activeRegistro.value)
const micModo = computed(() => (composerTexto.value.trim() ? 'send' : 'mic'))

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
    horaInicio: formatarHora(r.iniciadoEm),
    entradas: r.entradas,
    status: r.status
  }))
  const doServidor = registrosServidorRecentes.value
    .filter((r) => !locaisIds.has(r.id))
    .map((r) => ({
      id: r.id,
      aluno: r.aluno,
      titulo: r.titulo,
      horaInicio: formatarHora(r.iniciado_em),
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
    registrosServidorRecentes.value = lista.slice(0, 8)
  } catch (_err) {
    // offline-ish ou erro de rede: a lista local já cobre o essencial
  }
}

watch(alunoAtualId, (novo) => {
  if (novo) localStorage.setItem(ULTIMO_ALUNO_KEY, novo)
})

onMounted(async () => {
  syncQueue.iniciarMotor()
  await carregarAlunos()
  await carregarRecentesServidor()
})

onBeforeUnmount(() => {
  clearInterval(cronometroInterval)
  gravador.cancelar()
})

function abrirSheet() {
  if (!activeRegistro.value) sheetAberto.value = true
}
function selecionarAluno(id) {
  alunoAtualId.value = id
  sheetAberto.value = false
}

function iniciarRegistro() {
  if (!alunoAtualId.value) return
  activeRegistro.value = {
    id: crypto.randomUUID(),
    alunoId: alunoAtualId.value,
    titulo: registroTituloInput.value.trim(),
    iniciadoEm: new Date().toISOString(),
    entradas: []
  }
  registroTituloInput.value = ''
  estagio.value = 'composer'
}

function adicionarTexto() {
  const valor = composerTexto.value.trim()
  if (!valor || !activeRegistro.value) return
  activeRegistro.value.entradas.push({ ordem: activeRegistro.value.entradas.length, tipo: 'texto', conteudoTexto: valor })
  composerTexto.value = ''
}

function removerEntrada(indice) {
  activeRegistro.value.entradas.splice(indice, 1)
  activeRegistro.value.entradas.forEach((entrada, i) => {
    entrada.ordem = i
  })
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
  if (!resultado || elapsedMs < 400 || !activeRegistro.value) return
  const ordem = activeRegistro.value.entradas.length
  activeRegistro.value.entradas.push({
    ordem,
    tipo: 'audio',
    duracaoSegundos: Math.round(elapsedMs / 1000),
    audioBlob: resultado.blob
  })
}

function onMicClick() {
  if (micModo.value === 'send') adicionarTexto()
}

async function finalizarRegistro() {
  const registro = activeRegistro.value
  if (!registro.entradas.length) {
    showToast('Adicione ao menos um áudio ou texto antes de finalizar.', 'warning')
    return
  }

  for (const entrada of registro.entradas) {
    if (entrada.tipo === 'audio' && entrada.audioBlob) {
      await salvarAudioLocal(registro.id, entrada.ordem, entrada.audioBlob)
    }
  }

  const registroLocal = {
    id: registro.id,
    alunoId: registro.alunoId,
    titulo: registro.titulo,
    iniciadoEm: registro.iniciadoEm,
    status: 'pendente_sincronizacao',
    entradas: registro.entradas.map(({ audioBlob: _audioBlob, ...resto }) => resto)
  }

  await syncQueue.registrarFinalizado(registroLocal)
  syncQueue.processarFila() // dispara já, sem travar a UI esperando a rede
  activeRegistro.value = null
  estagio.value = 'idle'
  showToast(
    syncQueue.online ? 'Registro salvo. Sincronizando…' : 'Registro salvo no dispositivo. Será sincronizado quando houver conexão.',
    syncQueue.online ? 'success' : 'warning'
  )
  carregarRecentesServidor()
}

function descartar() {
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
  activeRegistro.value = null
  estagio.value = 'idle'
  showToast('Registro descartado.', 'neutral')
}
</script>

<template>
  <div class="captura-screen">
    <div class="app-topbar">
      <button class="current-student" :class="{ 'is-locked': Boolean(activeRegistro) }" type="button" @click="abrirSheet">
        <span v-if="alunoAtual" class="avatar" :style="{ background: corParaId(alunoAtual.id) }">{{ iniciais(alunoAtual.nome) }}</span>
        <span class="current-student-info">
          <span class="current-student-label">Aluno atual</span>
          <span class="current-student-name">{{ alunoAtual ? alunoAtual.nome : 'Selecionar aluno' }}<span class="current-student-caret">▾</span></span>
        </span>
      </button>
      <router-link class="icon-btn" to="/admin" title="Painel admin">🖥️</router-link>
      <button class="icon-btn" type="button" title="Sair" @click="auth.logout(); $router.replace('/login')">🚪</button>
    </div>

    <button class="sync-banner" :class="bannerClasse" type="button" @click="syncQueue.processarFila()">
      <span class="sync-banner-dot"></span>
      <span>{{ bannerTexto }}</span>
    </button>

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
            <span class="badge badge-neutral">{{ recentes.length }}</span>
          </div>
          <div class="recent-list">
            <div v-if="!recentes.length" class="recent-item-empty">Nenhum registro ainda hoje.</div>
            <div v-for="item in recentes" :key="item.id" class="recent-item">
              <span class="recent-item-avatar" :style="{ background: item.aluno ? corParaId(item.aluno.id) : '#9ca3af' }">
                {{ item.aluno ? iniciais(item.aluno.nome) : '?' }}
              </span>
              <span class="recent-item-body">
                <span class="recent-item-title">{{ item.aluno ? item.aluno.nome : 'Aluno' }}{{ item.titulo ? ' · ' + item.titulo : '' }}</span>
                <span class="recent-item-sub">{{ item.horaInicio }} · {{ resumoEntradas(item.entradas) }}</span>
              </span>
              <span class="badge" :class="'badge-' + statusMeta(item.status).badge">{{ statusMeta(item.status).icon }} {{ statusMeta(item.status).label }}</span>
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
              <span class="registro-header-title">Registro aberto — {{ alunoAtual?.nome }}{{ activeRegistro.titulo ? ' · ' + activeRegistro.titulo : '' }}</span>
              <span class="registro-header-sub">{{ activeRegistro.entradas.length }} entrada(s)</span>
            </span>
            <button class="registro-header-close" type="button" title="Descartar registro" @click="descartar">✕</button>
          </div>

          <div class="entries-scroll">
            <div v-if="!activeRegistro.entradas.length" class="entries-empty">
              Toque e segure o microfone para gravar, ou digite um texto abaixo.
            </div>
            <div v-for="(entrada, indice) in activeRegistro.entradas" :key="indice" class="entry-bubble" :class="entrada.tipo">
              <span class="entry-bubble-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
              <span class="entry-bubble-body">
                <span class="entry-bubble-label">{{ entrada.tipo === 'audio' ? 'Áudio' : 'Texto' }}</span>
                <span class="entry-bubble-content">
                  {{ entrada.tipo === 'audio' ? `Áudio gravado · ${entrada.duracaoSegundos}s` : entrada.conteudoTexto }}
                </span>
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
    <AlunoSheet :aberto="sheetAberto" :alunos="alunos" :aluno-atual-id="alunoAtualId" @fechar="sheetAberto = false" @selecionar="selecionarAluno" />
  </div>
</template>
