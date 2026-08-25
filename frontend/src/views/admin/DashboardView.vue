<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import registrosService from '../../services/registros.service.js'
import { statusMeta, corParaId, iniciais, formatarHora } from '../../utils/registroStatus.js'

const router = useRouter()
const registros = ref([])
const carregando = ref(true)

async function carregar() {
  carregando.value = true
  try {
    registros.value = await registrosService.listar({})
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

const hojeIso = new Date().toISOString().slice(0, 10)
function ehHoje(dataIso) {
  return dataIso && dataIso.slice(0, 10) === hojeIso
}
function ehUltimos7Dias(dataIso) {
  if (!dataIso) return false
  const diffMs = Date.now() - new Date(dataIso).getTime()
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000
}

const aguardandoRevisao = computed(() => registros.value.filter((r) => r.status === 'aguardando_revisao'))
const emProcessamento = computed(() => registros.value.filter((r) => ['recebido', 'transcrevendo', 'interpretando'].includes(r.status)))
const alunosAtendidosHoje = computed(() => new Set(registros.value.filter((r) => ehHoje(r.created_at)).map((r) => r.aluno_id)).size)
const confirmadosSemana = computed(
  () => registros.value.filter((r) => r.status === 'confirmado' && ehUltimos7Dias(r.validacao?.confirmado_em)).length
)

const recentes = computed(() => registros.value.slice(0, 6))

function abrirRevisao(id) {
  router.push({ name: 'admin-revisao', params: { id } })
}

const nomeUsuario = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('personal_assistant_usuario') || 'null')?.nome?.split(' ')[0] || ''
  } catch (_err) {
    return ''
  }
})
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Olá{{ nomeUsuario ? ', ' + nomeUsuario : '' }} 👋</h1>
        <p>Aqui está o resumo do seu dia.</p>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="card kpi-card">
        <div class="kpi-label">Aguardando revisão</div>
        <div class="kpi-value">{{ aguardandoRevisao.length }}</div>
        <div class="kpi-sub warn">Registros com IA processada</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Alunos atendidos hoje</div>
        <div class="kpi-value">{{ alunosAtendidosHoje }}</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Registros confirmados (7 dias)</div>
        <div class="kpi-value">{{ confirmadosSemana }}</div>
        <div class="kpi-sub up">Já validados e no histórico</div>
      </div>
      <div class="card kpi-card">
        <div class="kpi-label">Em processamento</div>
        <div class="kpi-value">{{ emProcessamento.length }}</div>
        <div class="kpi-sub">Transcrição/IA em andamento</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header">
          <h3>Fila de revisão</h3>
          <router-link :to="{ name: 'admin-revisao' }">Ver tudo</router-link>
        </div>
        <div v-if="!aguardandoRevisao.length" class="empty-state" style="padding: 26px;">
          <div class="empty-state-icon">✅</div>Nenhum registro pendente de revisão.
        </div>
        <div v-for="registro in aguardandoRevisao.slice(0, 4)" :key="registro.id" class="list-row row-clickable" @click="abrirRevisao(registro.id)">
          <span class="avatar sz-sm" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
          <span class="list-row-body">
            <span class="list-row-title">{{ registro.aluno?.nome }} — {{ registro.titulo || 'Registro' }}</span>
            <span class="list-row-sub">{{ registro.entradas?.length || 0 }} entrada(s) — {{ formatarHora(registro.iniciado_em) }}</span>
          </span>
          <span class="badge badge-primary">Revisar</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Atividade recente</h3></div>
        <div v-for="registro in recentes" :key="registro.id" class="sidebar-card-item">
          <span class="dot" :style="{ background: corParaId(registro.aluno?.id) }"></span>
          <span>
            <strong>{{ registro.aluno?.nome }}</strong> — {{ registro.titulo || 'Registro' }} · {{ formatarHora(registro.iniciado_em) }}<br />
            <span class="badge" :class="'badge-' + statusMeta(registro.status).badge" style="margin-top: 4px;">
              {{ statusMeta(registro.status).icon }} {{ statusMeta(registro.status).label }}
            </span>
          </span>
        </div>
        <div v-if="!recentes.length && !carregando" class="empty-state" style="padding: 26px;">Nenhum registro ainda.</div>
      </div>
    </div>
  </div>
</template>
