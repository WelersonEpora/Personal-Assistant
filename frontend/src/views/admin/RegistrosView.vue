<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import registrosService from '../../services/registros.service.js'
import { statusMeta, resumoEntradas, entradaIcon, corParaId, iniciais, formatarData, formatarHora } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import { useConfirm } from '../../composables/useConfirm.js'
import ToastStack from '../../components/ToastStack.vue'

const { toasts, showToast } = useToasts()
const { confirmar } = useConfirm()

const FILTROS = [
  { status: 'todos', label: 'Todos' },
  { status: 'recebido', label: 'Recebidos' },
  { status: 'transcrevendo', label: 'Transcrevendo' },
  { status: 'interpretando', label: 'Interpretando' },
  { status: 'aguardando_revisao', label: 'Aguardando revisão' },
  { status: 'confirmado', label: 'Confirmados' },
  { status: 'erro_transcricao', label: 'Com erro' }
]

const router = useRouter()
const registros = ref([])
const carregando = ref(true)
const filtroAtivo = ref('todos')
const busca = ref('')
let intervalId = null

async function carregar() {
  carregando.value = true
  try {
    registros.value = await registrosService.listar({})
  } finally {
    carregando.value = false
  }
}
onMounted(() => {
  carregar()
  intervalId = setInterval(carregar, 20000)
})
onBeforeUnmount(() => clearInterval(intervalId))

// Fila de IA (docs/adr/0009) - quantos Registros ainda não chegaram a
// aguardando_revisao. Só faz sentido nesta tela (onde os status do
// pipeline aparecem nos cards) - não é "sincronização" (esse termo é do
// fluxo offline→servidor do celular, ver docs/adr/0005).
const pendentesProcessamento = computed(
  () => registros.value.filter((r) => ['recebido', 'transcrevendo', 'interpretando'].includes(r.status)).length
)
const filaTexto = computed(() =>
  pendentesProcessamento.value > 0 ? `Processando ${pendentesProcessamento.value} registro(s)…` : 'Nada na fila de IA'
)

const listaFiltrada = computed(() => {
  let lista = registros.value
  if (filtroAtivo.value !== 'todos') {
    if (filtroAtivo.value === 'erro_transcricao') {
      lista = lista.filter((r) => r.status === 'erro_transcricao' || r.status === 'erro_interpretacao')
    } else {
      lista = lista.filter((r) => r.status === filtroAtivo.value)
    }
  }
  if (busca.value.trim()) {
    const termo = busca.value.trim().toLowerCase()
    lista = lista.filter((r) => r.aluno?.nome?.toLowerCase().includes(termo))
  }
  return lista
})

// Clicar em qualquer lugar do card expande/colapsa - independe do status
// (o áudio já existe no servidor desde a sincronização, antes mesmo da IA
// processar). `listar()` só traz id/tipo/ordem por entrada (lista leve, ver
// registro.repository.js) - ao expandir pela 1a vez, busca o detalhe
// completo (texto/duração) e, para as de áudio, o Blob sob demanda (mesmo
// padrão de CapturaView/RevisaoView).
const expandidoId = ref(null)

async function alternarExpandido(registro) {
  expandidoId.value = expandidoId.value === registro.id ? null : registro.id
  if (expandidoId.value !== registro.id) return

  if (!registro.entradasDetalhadas) {
    try {
      const detalhe = await registrosService.obter(registro.id)
      registro.entradas = detalhe.entradas || []
      registro.entradasDetalhadas = true
    } catch (_err) {
      return // sem detalhe disponível - fica só com id/tipo/ordem
    }
  }

  await Promise.all(
    registro.entradas
      .filter((entrada) => entrada.tipo === 'audio' && entrada.arquivoAudio && !entrada.audioUrl)
      .map(async (entrada) => {
        try {
          const blob = await registrosService.obterAudio(registro.id, entrada.id)
          entrada.audioUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // sem áudio disponível - só essa entrada fica sem player
        }
      })
  )
}

function revogarAudios() {
  registros.value.forEach((registro) => {
    (registro.entradas || []).forEach((entrada) => {
      if (entrada.audioUrl) URL.revokeObjectURL(entrada.audioUrl)
    })
  })
}
onBeforeUnmount(revogarAudios)

// Exclusão (soft-delete, docs/adr/0007) - o backend já rejeita "confirmado",
// mas a UI nem oferece o botão nesse caso, pra não convidar a tentativa.
async function excluirRegistro(registro) {
  const ok = await confirmar({
    titulo: 'Excluir este registro?',
    mensagem: 'Essa ação não pode ser desfeita.',
    perigo: true
  })
  if (!ok) return
  try {
    await registrosService.excluir(registro.id)
    registros.value = registros.value.filter((r) => r.id !== registro.id)
    showToast('Registro excluído.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível excluir o registro.', 'warning')
  }
}

// Reprocessamento manual (só oferecido para Registros parados em
// erro_transcricao/erro_interpretacao) - volta pra fila de IA sem precisar
// gravar tudo de novo, já que áudios e textos capturados não se perdem.
async function reprocessarRegistro(registro) {
  try {
    const atualizado = await registrosService.reprocessar(registro.id)
    registro.status = atualizado.status
    showToast('Registro reenviado para a IA.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível reprocessar o registro.', 'warning')
  }
}
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Relatos</h1>
        <p>Registros recebidos do celular — cada um agrupa os áudios e textos capturados até o personal finalizar.</p>
      </div>
      <div class="sync-pill" :class="{ 'state-pending': pendentesProcessamento > 0 }">
        <span class="sync-pill-dot"></span><span>{{ filaTexto }}</span>
      </div>
    </div>

    <div class="card" style="margin-bottom: 16px;">
      <div class="table-toolbar">
        <div class="filter-tabs">
          <span
            v-for="filtro in FILTROS"
            :key="filtro.status"
            class="filter-tab"
            :class="{ active: filtroAtivo === filtro.status }"
            @click="filtroAtivo = filtro.status"
          >
            {{ filtro.label }}
          </span>
        </div>
        <input v-model="busca" class="search-input" placeholder="Buscar por aluno…" />
      </div>
    </div>

    <div class="registros-list">
      <div
        v-for="registro in listaFiltrada"
        :key="registro.id"
        class="card registro-card row-clickable"
        @click="alternarExpandido(registro)"
      >
        <div class="registro-card-head">
          <div class="registro-card-who">
            <span class="avatar sz-sm" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
            <div>
              <div class="list-row-title">{{ registro.aluno?.nome }} — Registro de {{ formatarData(registro.created_at) }}</div>
              <div class="list-row-sub">{{ registro.titulo || 'Sem título' }} · iniciado às {{ formatarHora(registro.iniciado_em) }}</div>
            </div>
          </div>
          <div class="registro-card-head-actions">
            <span class="badge" :class="'badge-' + statusMeta(registro.status).badge">{{ statusMeta(registro.status).icon }} {{ statusMeta(registro.status).label }}</span>
            <button
              v-if="registro.status === 'erro_transcricao' || registro.status === 'erro_interpretacao'"
              type="button"
              class="registro-card-delete"
              title="Tentar novamente"
              @click.stop="reprocessarRegistro(registro)"
            >
              🔁
            </button>
            <button
              v-if="registro.status !== 'confirmado'"
              type="button"
              class="registro-card-delete"
              title="Excluir registro"
              @click.stop="excluirRegistro(registro)"
            >
              🗑️
            </button>
          </div>
        </div>
        <div class="registro-card-entries">
          <span v-for="entrada in registro.entradas || []" :key="entrada.id" class="entry-chip" :class="'entry-chip-' + entrada.tipo">
            {{ entradaIcon(entrada.tipo) }}
          </span>
          <span class="registro-card-count">{{ (registro.entradas || []).length }} entrada(s)</span>
        </div>
        <div v-if="expandidoId === registro.id" class="transcript-box open" @click.stop>
          <div v-for="entrada in registro.entradas || []" :key="entrada.id" class="source-entry">
            <span class="source-entry-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
            <div class="source-entry-body">
              <div class="source-entry-meta">{{ entrada.tipo === 'audio' ? `Áudio${entrada.duracao_segundos ? ' · ' + entrada.duracao_segundos + 's' : ''}` : 'Texto' }}</div>
              <template v-if="entrada.tipo === 'audio'">
                <audio v-if="entrada.audioUrl" :src="entrada.audioUrl" controls class="source-entry-audio"></audio>
                <span v-else class="source-entry-text" style="font-style: normal;">Áudio indisponível.</span>
              </template>
              <div v-else class="source-entry-text">"{{ entrada.conteudo_texto }}"</div>
            </div>
          </div>
        </div>
        <button
          v-if="registro.status === 'aguardando_revisao'"
          type="button"
          class="registro-card-foot"
          @click.stop="router.push({ name: 'admin-revisao', params: { id: registro.id } })"
        >
          Revisar →
        </button>
      </div>

      <div v-if="!carregando && !listaFiltrada.length" class="empty-state">Nenhum registro encontrado.</div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>
