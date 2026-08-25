<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import alunosService from '../../services/alunos.service.js'
import registrosService from '../../services/registros.service.js'
import { corParaId, iniciais } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'

const router = useRouter()
const { toasts, showToast } = useToasts()

const alunos = ref([])
const registrosPorAluno = ref({})
const carregando = ref(true)
const modalAberto = ref(false)
const novoNome = ref('')
const novasObservacoes = ref('')
const salvando = ref(false)

async function carregar() {
  carregando.value = true
  try {
    const [listaAlunos, listaRegistros] = await Promise.all([alunosService.listar(), registrosService.listar({})])
    alunos.value = listaAlunos
    registrosPorAluno.value = listaRegistros.reduce((mapa, registro) => {
      mapa[registro.aluno_id] = (mapa[registro.aluno_id] || 0) + 1
      return mapa
    }, {})
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

function abrirDetalhe(id) {
  router.push({ name: 'admin-aluno-detalhe', params: { id } })
}

function abrirModal() {
  novoNome.value = ''
  novasObservacoes.value = ''
  modalAberto.value = true
}

async function salvarNovoAluno() {
  if (!novoNome.value.trim()) return
  salvando.value = true
  try {
    await alunosService.criar({ nome: novoNome.value.trim(), observacoes: novasObservacoes.value.trim() || null })
    modalAberto.value = false
    showToast('Aluno cadastrado.', 'success')
    await carregar()
  } catch (_err) {
    showToast('Não foi possível cadastrar o aluno.', 'warning')
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Alunos</h1>
        <p>{{ alunos.length }} aluno(s) cadastrado(s).</p>
      </div>
      <button class="btn btn-primary" type="button" @click="abrirModal">+ Novo aluno</button>
    </div>

    <div class="students-grid">
      <div v-for="aluno in alunos" :key="aluno.id" class="card student-card" @click="abrirDetalhe(aluno.id)">
        <div class="student-card-top">
          <span class="avatar sz-lg" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
          <div>
            <div class="student-card-name">{{ aluno.nome }}</div>
            <div class="student-card-plan" v-if="!aluno.ativo">Inativo</div>
          </div>
        </div>
        <div v-if="aluno.observacoes" class="student-card-workout">{{ aluno.observacoes }}</div>
        <div style="font-size: 12px; color: var(--color-text-faint);">{{ registrosPorAluno[aluno.id] || 0 }} registro(s)</div>
      </div>
    </div>

    <div v-if="!carregando && !alunos.length" class="empty-state">
      <div class="empty-state-icon">👥</div>Nenhum aluno cadastrado ainda.
    </div>

    <div v-if="modalAberto" class="sheet-overlay open" style="position: fixed;" @click.self="modalAberto = false">
      <div class="card" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 360px; padding: 22px;">
        <h3 style="margin-bottom: 14px;">Novo aluno</h3>
        <form @submit.prevent="salvarNovoAluno">
          <div class="form-field" style="margin-bottom: 12px;">
            <label>Nome</label>
            <input v-model="novoNome" type="text" required autofocus />
          </div>
          <div class="form-field" style="margin-bottom: 16px;">
            <label>Observações (opcional)</label>
            <textarea v-model="novasObservacoes" rows="2"></textarea>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-ghost" @click="modalAberto = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="salvando || !novoNome.trim()">Salvar</button>
          </div>
        </form>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>
