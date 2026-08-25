<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import registrosService from '../../services/registros.service.js'
import { statusMeta, resumoEntradas, entradaIcon, corParaId, iniciais, formatarData, formatarHora } from '../../utils/registroStatus.js'

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

async function carregar() {
  carregando.value = true
  try {
    registros.value = await registrosService.listar({})
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

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

function abrir(registro) {
  if (registro.status === 'aguardando_revisao') {
    router.push({ name: 'admin-revisao', params: { id: registro.id } })
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
        class="card registro-card"
        :class="{ 'row-clickable': registro.status === 'aguardando_revisao' }"
        @click="abrir(registro)"
      >
        <div class="registro-card-head">
          <div class="registro-card-who">
            <span class="avatar sz-sm" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
            <div>
              <div class="list-row-title">{{ registro.aluno?.nome }} — Registro de {{ formatarData(registro.created_at) }}</div>
              <div class="list-row-sub">{{ registro.titulo || 'Sem título' }} · iniciado às {{ formatarHora(registro.iniciado_em) }}</div>
            </div>
          </div>
          <span class="badge" :class="'badge-' + statusMeta(registro.status).badge">{{ statusMeta(registro.status).icon }} {{ statusMeta(registro.status).label }}</span>
        </div>
        <div class="registro-card-entries">
          <span v-for="entrada in registro.entradas || []" :key="entrada.id" class="entry-chip" :class="'entry-chip-' + entrada.tipo">
            {{ entradaIcon(entrada.tipo) }}
          </span>
          <span class="registro-card-count">{{ (registro.entradas || []).length }} entrada(s)</span>
        </div>
        <div v-if="registro.status === 'aguardando_revisao'" class="registro-card-foot">Revisar →</div>
      </div>

      <div v-if="!carregando && !listaFiltrada.length" class="empty-state">Nenhum registro encontrado.</div>
    </div>
  </div>
</template>
