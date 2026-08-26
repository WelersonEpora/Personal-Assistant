<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import alunosService from '../../services/alunos.service.js'
import registrosService from '../../services/registros.service.js'
import { corParaId, iniciais, statusMeta, resumoEntradas, formatarData } from '../../utils/registroStatus.js'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()

const aluno = ref(null)
const registros = ref([])
const carregando = ref(true)

async function carregar() {
  carregando.value = true
  try {
    const [dadosAluno, todosRegistros] = await Promise.all([alunosService.obter(props.id), registrosService.listar({})])
    aluno.value = dadosAluno
    registros.value = todosRegistros.filter((r) => r.aluno_id === props.id)
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

const confirmados = computed(() => registros.value.filter((r) => r.status === 'confirmado'))
const emAndamento = computed(() => registros.value.filter((r) => r.status !== 'confirmado'))
</script>

<template>
  <div v-if="aluno">
    <router-link class="detail-back" :to="{ name: 'admin-alunos' }">← Voltar para Alunos</router-link>
    <div class="detail-header">
      <span class="avatar sz-lg" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
      <div>
        <div class="detail-header-name">{{ aluno.nome }}</div>
        <div v-if="aluno.observacoes" class="detail-header-sub">{{ aluno.observacoes }}</div>
        <div class="detail-tags">
          <span class="badge" :class="aluno.ativo ? 'badge-success' : 'badge-neutral'">{{ aluno.ativo ? 'Ativo' : 'Inativo' }}</span>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header"><h3>Histórico confirmado</h3></div>
        <div v-if="!confirmados.length" class="empty-state" style="padding: 20px;">Sem registros confirmados ainda.</div>
        <div
          v-for="registro in confirmados"
          :key="registro.id"
          class="list-row row-clickable"
          @click="router.push({ name: 'admin-historico-detalhe', params: { id: registro.id } })"
        >
          <span class="list-row-body">
            <span class="list-row-title">{{ registro.titulo || 'Registro' }}</span>
            <span class="list-row-sub">{{ formatarData(registro.created_at) }} — {{ registro.validacao?.payload_confirmado_json?.itens?.length || 0 }} item(ns)</span>
          </span>
          <span class="badge badge-success">Confirmado</span>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Relatos em andamento</h3></div>
        <div v-if="!emAndamento.length" class="empty-state" style="padding: 20px;">Nenhum relato em aberto.</div>
        <div v-for="registro in emAndamento" :key="registro.id" class="list-row row-clickable" @click="registro.status === 'aguardando_revisao' && router.push({ name: 'admin-revisao', params: { id: registro.id } })">
          <span class="list-row-body">
            <span class="list-row-title">{{ formatarData(registro.created_at) }} — {{ registro.titulo || 'Registro' }}</span>
            <span class="list-row-sub">{{ resumoEntradas(registro.entradas || []) }}</span>
          </span>
          <span class="badge" :class="'badge-' + statusMeta(registro.status).badge">{{ statusMeta(registro.status).label }}</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="!carregando" class="empty-state">Aluno não encontrado.</div>
</template>
