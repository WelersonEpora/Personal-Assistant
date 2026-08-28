<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import alunosService from '../../services/alunos.service.js'
import { corParaId, iniciais } from '../../utils/registroStatus.js'
import { calcularIdade, formatarDataAvaliacao } from '../../utils/avaliacaoFisica.js'
import { useToasts } from '../../composables/useToasts.js'
import { useConfirm } from '../../composables/useConfirm.js'
import ToastStack from '../../components/ToastStack.vue'
import AcompanhamentoAluno from '../../components/AcompanhamentoAluno.vue'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const { toasts, showToast } = useToasts()
const { confirmar } = useConfirm()

const aluno = ref(null)
const carregando = ref(true)
const fotoUrl = ref(null)

const editando = ref(false)
const nomeEdit = ref('')
const telefoneEdit = ref('')
const observacoesEdit = ref('')
const dataNascimentoEdit = ref('')
const sexoEdit = ref('')
const salvando = ref(false)
const enviandoFoto = ref(false)
const removendoFoto = ref(false)
const fotoInput = ref(null)

async function carregarFoto() {
  if (fotoUrl.value) {
    URL.revokeObjectURL(fotoUrl.value)
    fotoUrl.value = null
  }
  if (!aluno.value?.foto_caminho) return
  try {
    const blob = await alunosService.obterFoto(props.id)
    fotoUrl.value = URL.createObjectURL(blob)
  } catch (_err) {
    // sem foto disponível - fica só com as iniciais
  }
}

async function carregar() {
  carregando.value = true
  try {
    aluno.value = await alunosService.obter(props.id)
    await carregarFoto()
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)
onBeforeUnmount(() => {
  if (fotoUrl.value) URL.revokeObjectURL(fotoUrl.value)
})

function iniciarEdicao() {
  nomeEdit.value = aluno.value.nome
  telefoneEdit.value = aluno.value.telefone || ''
  observacoesEdit.value = aluno.value.observacoes || ''
  dataNascimentoEdit.value = aluno.value.data_nascimento ? String(aluno.value.data_nascimento).slice(0, 10) : ''
  sexoEdit.value = aluno.value.sexo || ''
  editando.value = true
}

async function salvarEdicao() {
  if (!nomeEdit.value.trim()) return
  salvando.value = true
  try {
    aluno.value = await alunosService.atualizar(props.id, {
      nome: nomeEdit.value.trim(),
      telefone: telefoneEdit.value.trim() || null,
      observacoes: observacoesEdit.value.trim() || null,
      data_nascimento: dataNascimentoEdit.value || null,
      sexo: sexoEdit.value || null
    })
    editando.value = false
    showToast('Dados do aluno atualizados.', 'success')
  } catch (_err) {
    showToast('Não foi possível salvar as alterações.', 'warning')
  } finally {
    salvando.value = false
  }
}

function selecionarFoto() {
  fotoInput.value?.click()
}

async function onFotoSelecionada(evento) {
  const arquivo = evento.target.files?.[0]
  evento.target.value = ''
  if (!arquivo) return
  enviandoFoto.value = true
  try {
    aluno.value = await alunosService.enviarFoto(props.id, arquivo)
    await carregarFoto()
    showToast('Foto atualizada.', 'success')
  } catch (_err) {
    showToast('Não foi possível enviar a foto (use JPEG, PNG ou WebP, até 5MB).', 'warning')
  } finally {
    enviandoFoto.value = false
  }
}

async function removerFoto() {
  removendoFoto.value = true
  try {
    aluno.value = await alunosService.removerFoto(props.id)
    await carregarFoto()
    showToast('Foto removida.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível remover a foto.', 'warning')
  } finally {
    removendoFoto.value = false
  }
}

async function alternarFavorito() {
  const favorito = !aluno.value.favorito
  try {
    aluno.value = await alunosService.atualizar(props.id, { favorito })
  } catch (_err) {
    showToast('Não foi possível atualizar o favorito.', 'warning')
  }
}

// Inativo é diferente de excluído (ver excluirAluno abaixo) - o aluno some
// da lista de "Ativos" mas o histórico e o cadastro continuam intactos
// para quando ele voltar.
async function alternarAtivo() {
  const ativo = !aluno.value.ativo
  if (!ativo) {
    const ok = await confirmar({
      titulo: `Marcar ${aluno.value.nome} como inativo?`,
      mensagem: 'O aluno sai da lista de ativos e do lote de avaliação mensal. O cadastro e o histórico continuam intactos — dá pra reativar quando quiser.',
      confirmarLabel: 'Marcar como inativo'
    })
    if (!ok) return
  }
  try {
    aluno.value = await alunosService.atualizar(props.id, { ativo })
    showToast(ativo ? 'Aluno marcado como ativo.' : 'Aluno marcado como inativo.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível atualizar o status do aluno.', 'warning')
  }
}

// Soft-delete (docs/adr/0007) - leva consigo todos os Registros/Validações
// do aluno, por isso o aviso explícito antes de confirmar.
async function excluirAluno() {
  const ok = await confirmar({
    titulo: `Excluir ${aluno.value.nome}?`,
    mensagem: 'Isso também remove todos os relatos e avaliações deste aluno. Essa ação não pode ser desfeita.',
    perigo: true,
    confirmarLabel: 'Excluir aluno'
  })
  if (!ok) return
  try {
    await alunosService.excluir(props.id)
    showToast('Aluno excluído.', 'neutral')
    router.push({ name: 'admin-alunos' })
  } catch (_err) {
    showToast('Não foi possível excluir o aluno.', 'warning')
  }
}

</script>

<template>
  <div v-if="aluno">
    <router-link class="detail-back" :to="{ name: 'admin-alunos' }">← Voltar para Alunos</router-link>
    <div class="detail-header">
      <div style="position: relative;">
        <img v-if="fotoUrl" :src="fotoUrl" class="avatar sz-lg" alt="" />
        <span v-else class="avatar sz-lg" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
        <button type="button" class="btn btn-ghost" title="Enviar foto" style="position: absolute; bottom: -8px; right: -8px; padding: 4px 7px;" :disabled="enviandoFoto" @click="selecionarFoto">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />
          </svg>
        </button>
        <button
          v-if="fotoUrl"
          type="button"
          class="btn btn-ghost"
          title="Remover foto"
          style="position: absolute; bottom: -8px; left: -8px; padding: 3px 7px; font-size: 15px;"
          :disabled="removendoFoto"
          @click="removerFoto"
        >
          🗑️
        </button>
        <input ref="fotoInput" type="file" accept="image/jpeg,image/png,image/webp" style="display: none;" @change="onFotoSelecionada" />
      </div>
      <div style="flex: 1;">
        <template v-if="!editando">
          <div class="detail-header-name" style="display: flex; align-items: center; gap: 8px;">
            {{ aluno.nome }}
            <button
              type="button"
              class="student-card-favorite"
              :title="aluno.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'"
              @click="alternarFavorito"
            >
              {{ aluno.favorito ? '⭐' : '☆' }}
            </button>
          </div>
          <div v-if="aluno.telefone" class="detail-header-sub">📞 {{ aluno.telefone }}</div>
          <div v-if="aluno.data_nascimento || aluno.sexo" class="detail-header-sub">
            <template v-if="aluno.data_nascimento">
              🎂 {{ formatarDataAvaliacao(aluno.data_nascimento) }}
              <template v-if="calcularIdade(aluno.data_nascimento) !== null"> ({{ calcularIdade(aluno.data_nascimento) }} anos)</template>
            </template>
            <template v-if="aluno.sexo"> · {{ aluno.sexo === 'F' ? 'Feminino' : 'Masculino' }}</template>
          </div>
          <div v-if="aluno.observacoes" class="detail-header-sub">{{ aluno.observacoes }}</div>
          <div class="detail-tags">
            <button
              type="button"
              class="badge"
              style="border: none; cursor: pointer;"
              :class="aluno.ativo ? 'badge-success' : 'badge-neutral'"
              :title="aluno.ativo ? 'Marcar como inativo' : 'Marcar como ativo'"
              @click="alternarAtivo"
            >
              {{ aluno.ativo ? 'Ativo' : 'Inativo' }}
            </button>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 10px; justify-content: space-between; align-items: center;">
            <div style="display: flex; gap: 10px; align-items: center;">
              <button type="button" class="btn btn-primary" @click="iniciarEdicao">Editar</button>
              <button type="button" class="btn btn-danger-ghost" @click="excluirAluno">Excluir aluno</button>
            </div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <router-link class="btn btn-primary" :to="{ name: 'admin-aluno-ficha-treino', params: { id: props.id } }">📋 Ficha de Treino</router-link>
              <router-link class="btn btn-primary" :to="{ name: 'admin-aluno-avaliacoes-fisicas', params: { id: props.id } }">🩺 Avaliações Físicas</router-link>
            </div>
          </div>
        </template>
        <form v-else @submit.prevent="salvarEdicao" style="max-width: 360px;">
          <div class="form-field" style="margin-bottom: 10px;">
            <label>Nome</label>
            <input v-model="nomeEdit" type="text" required autofocus />
          </div>
          <div class="form-field" style="margin-bottom: 10px;">
            <label>Telefone</label>
            <input v-model="telefoneEdit" type="tel" placeholder="(11) 99999-0000" />
          </div>
          <div style="display: flex; gap: 10px; margin-bottom: 10px;">
            <div class="form-field" style="flex: 1;">
              <label>Data de nascimento</label>
              <input v-model="dataNascimentoEdit" type="date" />
            </div>
            <div class="form-field" style="width: 110px;">
              <label>Sexo</label>
              <select v-model="sexoEdit">
                <option value="">—</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </select>
            </div>
          </div>
          <div class="form-field" style="margin-bottom: 12px;">
            <label>Observações</label>
            <textarea v-model="observacoesEdit" rows="2"></textarea>
          </div>
          <div style="display: flex; gap: 10px;">
            <button type="button" class="btn btn-ghost" @click="editando = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="salvando || !nomeEdit.trim()">Salvar</button>
          </div>
        </form>
      </div>
    </div>

    <AcompanhamentoAluno :id="props.id" />

    <ToastStack :toasts="toasts" />
  </div>
  <div v-else-if="!carregando" class="empty-state">Aluno não encontrado.</div>
</template>

<style scoped>
/* Avatar maior só nesta tela (a lista de Alunos mantém o .sz-lg padrão). */
.detail-header .avatar.sz-lg {
  width: 80px;
  height: 80px;
  font-size: 26px;
}
</style>
