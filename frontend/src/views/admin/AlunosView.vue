<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import alunosService from '../../services/alunos.service.js'
import { corParaId, iniciais } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import { useConfirm } from '../../composables/useConfirm.js'
import ToastStack from '../../components/ToastStack.vue'

const router = useRouter()
const { toasts, showToast } = useToasts()
const { confirmar } = useConfirm()

const alunos = ref([])
const carregando = ref(true)
const modalAberto = ref(false)
const novoNome = ref('')
const novoTelefone = ref('')
const novasObservacoes = ref('')
const salvando = ref(false)

async function carregarFotos() {
  await Promise.all(
    alunos.value
      .filter((aluno) => aluno.foto_caminho)
      .map(async (aluno) => {
        try {
          const blob = await alunosService.obterFoto(aluno.id)
          aluno.fotoUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // sem foto disponível - card fica só com as iniciais
        }
      })
  )
}

async function carregar() {
  carregando.value = true
  try {
    // O list de alunos já traz registros_count e avaliacoes_fisicas_count
    // calculados no backend (aluno.repository.js::findAllByEquipe).
    alunos.value = await alunosService.listar()
    await carregarFotos()
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

function revogarFotos() {
  alunos.value.forEach((aluno) => {
    if (aluno.fotoUrl) URL.revokeObjectURL(aluno.fotoUrl)
  })
}
onBeforeUnmount(revogarFotos)

// A ordenação (ativo > favorito > nome) é a mesma do backend (ver
// aluno.repository.js::findAllByEquipe) - reaplicada aqui depois de um
// toggle de favorito/ativo pra reordenar na hora, sem precisar de um
// recarregamento completo (que re-buscaria todas as fotos de novo).
function compararAlunos(a, b) {
  if (a.ativo !== b.ativo) return a.ativo ? -1 : 1
  if (a.favorito !== b.favorito) return a.favorito ? -1 : 1
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

const ativos = computed(() => alunos.value.filter((a) => a.ativo))
const inativos = computed(() => alunos.value.filter((a) => !a.ativo))

function abrirDetalhe(id) {
  router.push({ name: 'admin-aluno-detalhe', params: { id } })
}

async function alternarFavorito(aluno) {
  const favorito = !aluno.favorito
  try {
    await alunosService.atualizar(aluno.id, { favorito })
    aluno.favorito = favorito
    alunos.value.sort(compararAlunos)
  } catch (_err) {
    showToast('Não foi possível atualizar o favorito.', 'warning')
  }
}

// Inativo != excluído: o aluno só sai da seção "Ativos"; cadastro e
// histórico continuam intactos (mesma regra de AlunoDetalheView).
// Confirma só ao desativar - o badge fica logo abaixo do card clicável e
// um toque errado tirando o aluno da lista é chato de perceber; reativar
// não perde nada, então vai direto.
async function alternarAtivo(aluno) {
  const ativo = !aluno.ativo
  if (!ativo) {
    const ok = await confirmar({
      titulo: `Marcar ${aluno.nome} como inativo?`,
      mensagem: 'O aluno sai da lista de ativos e do lote de avaliação mensal. O cadastro e o histórico continuam intactos — dá pra reativar quando quiser.',
      confirmarLabel: 'Marcar como inativo'
    })
    if (!ok) return
  }
  try {
    await alunosService.atualizar(aluno.id, { ativo })
    aluno.ativo = ativo
    alunos.value.sort(compararAlunos)
    showToast(ativo ? 'Aluno marcado como ativo.' : 'Aluno marcado como inativo.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível atualizar o status.', 'warning')
  }
}

function abrirModal() {
  novoNome.value = ''
  novoTelefone.value = ''
  novasObservacoes.value = ''
  modalAberto.value = true
}

async function salvarNovoAluno() {
  if (!novoNome.value.trim()) return
  salvando.value = true
  try {
    await alunosService.criar({
      nome: novoNome.value.trim(),
      telefone: novoTelefone.value.trim() || null,
      observacoes: novasObservacoes.value.trim() || null
    })
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

    <p v-if="alunos.length" style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
      Ativos
    </p>
    <div v-if="alunos.length" class="students-grid" style="margin-bottom: 26px;">
      <div v-for="aluno in ativos" :key="aluno.id" class="card student-card" style="position: relative;" @click="abrirDetalhe(aluno.id)">
        <div class="student-card-actions">
          <button
            type="button"
            class="badge"
            style="border: none; cursor: pointer;"
            :class="aluno.ativo ? 'badge-success' : 'badge-neutral'"
            :title="aluno.ativo ? 'Marcar como inativo' : 'Marcar como ativo'"
            @click.stop="alternarAtivo(aluno)"
          >
            {{ aluno.ativo ? 'Ativo' : 'Inativo' }}
          </button>
          <button
            type="button"
            class="student-card-favorite"
            :title="aluno.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'"
            @click.stop="alternarFavorito(aluno)"
          >
            {{ aluno.favorito ? '⭐' : '☆' }}
          </button>
        </div>
        <div class="student-card-top">
          <img v-if="aluno.fotoUrl" :src="aluno.fotoUrl" class="avatar sz-lg" alt="" />
          <span v-else class="avatar sz-lg" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
          <div>
            <div class="student-card-name">{{ aluno.nome }}</div>
          </div>
        </div>
        <div v-if="aluno.observacoes" class="student-card-workout">{{ aluno.observacoes }}</div>
        <div style="font-size: 12px; color: var(--color-text-faint);">
          {{ aluno.registros_count || 0 }} relato(s) · {{ aluno.avaliacoes_fisicas_count || 0 }} aval. física(s)
        </div>
      </div>
      <div v-if="!ativos.length" class="card empty-state">Nenhum aluno ativo.</div>
    </div>

    <template v-if="inativos.length">
      <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
        Inativos
      </p>
      <div class="students-grid">
        <div v-for="aluno in inativos" :key="aluno.id" class="card student-card" style="position: relative; opacity: .7;" @click="abrirDetalhe(aluno.id)">
          <div class="student-card-actions">
            <button
              type="button"
              class="badge"
              style="border: none; cursor: pointer;"
              :class="aluno.ativo ? 'badge-success' : 'badge-neutral'"
              :title="aluno.ativo ? 'Marcar como inativo' : 'Marcar como ativo'"
              @click.stop="alternarAtivo(aluno)"
            >
              {{ aluno.ativo ? 'Ativo' : 'Inativo' }}
            </button>
            <button
              type="button"
              class="student-card-favorite"
              :title="aluno.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'"
              @click.stop="alternarFavorito(aluno)"
            >
              {{ aluno.favorito ? '⭐' : '☆' }}
            </button>
          </div>
          <div class="student-card-top">
            <img v-if="aluno.fotoUrl" :src="aluno.fotoUrl" class="avatar sz-lg" alt="" />
            <span v-else class="avatar sz-lg" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
            <div>
              <div class="student-card-name">{{ aluno.nome }}</div>
            </div>
          </div>
          <div v-if="aluno.observacoes" class="student-card-workout">{{ aluno.observacoes }}</div>
          <div style="font-size: 12px; color: var(--color-text-faint);">
            {{ aluno.registros_count || 0 }} relato(s) · {{ aluno.avaliacoes_fisicas_count || 0 }} aval. física(s)
          </div>
        </div>
      </div>
    </template>

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
          <div class="form-field" style="margin-bottom: 12px;">
            <label>Telefone (opcional)</label>
            <input v-model="novoTelefone" type="tel" placeholder="(11) 99999-0000" />
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
