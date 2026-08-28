<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import alunosService from '../../services/alunos.service.js'
import { corParaId, iniciais } from '../../utils/registroStatus.js'
import { calcularIdade, formatarDataAvaliacao } from '../../utils/avaliacaoFisica.js'
import { useToasts } from '../../composables/useToasts.js'
import { useConfirm } from '../../composables/useConfirm.js'
import ToastStack from '../../components/ToastStack.vue'
import AcompanhamentoAluno from '../../components/AcompanhamentoAluno.vue'
import FichaTreinoSecao from '../../components/FichaTreinoSecao.vue'
import AvaliacoesFisicasSecao from '../../components/AvaliacoesFisicasSecao.vue'

const props = defineProps({ id: { type: String, required: true } })
const route = useRoute()
const router = useRouter()

// Ficha de Treino e Avaliações Físicas deixaram de ser tela própria (como o
// Acompanhamento na docs/adr/0015): a parte de baixo da tela é um slot com
// abas. A aba fica no query da URL (?aba=ficha) - refresh e link direto
// continuam funcionando; as rotas antigas redirecionam pra cá.
const ABAS = [
  { id: 'acompanhamento', label: 'Acompanhamento' },
  { id: 'ficha', label: '📋 Ficha de Treino' },
  { id: 'avaliacoes', label: '🩺 Avaliações Físicas' }
]
const abaAtiva = computed(() => {
  const q = route.query.aba
  return ABAS.some((a) => a.id === q) ? q : 'acompanhamento'
})
function trocarAba(id) {
  router.replace({ query: id === 'acompanhamento' ? {} : { aba: id } })
}
const { toasts, showToast } = useToasts()
const { confirmar } = useConfirm()

const aluno = ref(null)
const carregando = ref(true)
const fotoUrl = ref(null)

// menuAberto: dropdown "⋯" com as ações de baixa frequência (editar cadastro,
// foto, ativo/inativo, excluir). editando: modal de edição do cadastro.
const menuAberto = ref(false)
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

function aoTeclar(evento) {
  if (evento.key !== 'Escape') return
  if (editando.value) editando.value = false
  else menuAberto.value = false
}
function fecharMenuFora() {
  menuAberto.value = false
}
onMounted(() => {
  window.addEventListener('keydown', aoTeclar)
  window.addEventListener('click', fecharMenuFora)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', aoTeclar)
  window.removeEventListener('click', fecharMenuFora)
  if (fotoUrl.value) URL.revokeObjectURL(fotoUrl.value)
})

function iniciarEdicao() {
  menuAberto.value = false
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
  menuAberto.value = false
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
  menuAberto.value = false
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
  menuAberto.value = false
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
  menuAberto.value = false
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

    <div class="card aluno-identidade">
      <div class="aluno-identidade-pessoa">
        <img v-if="fotoUrl" :src="fotoUrl" class="avatar sz-lg" alt="" />
        <span v-else class="avatar sz-lg" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
        <input ref="fotoInput" type="file" accept="image/jpeg,image/png,image/webp" style="display: none;" @change="onFotoSelecionada" />

        <div>
          <div class="detail-header-name aluno-identidade-nome">
            {{ aluno.nome }}
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
            <button
              type="button"
              class="student-card-favorite"
              :title="aluno.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'"
              @click="alternarFavorito"
            >
              {{ aluno.favorito ? '⭐' : '☆' }}
            </button>
          </div>
          <div v-if="aluno.telefone || aluno.data_nascimento || aluno.sexo" class="aluno-identidade-meta">
            <span v-if="aluno.telefone">📞 {{ aluno.telefone }}</span>
            <span v-if="aluno.data_nascimento">
              🎂 {{ formatarDataAvaliacao(aluno.data_nascimento) }}<template v-if="calcularIdade(aluno.data_nascimento) !== null"> ({{ calcularIdade(aluno.data_nascimento) }} anos)</template>
            </span>
            <span v-if="aluno.sexo">{{ aluno.sexo === 'F' ? 'Feminino' : 'Masculino' }}</span>
          </div>
          <div v-if="aluno.observacoes" class="aluno-identidade-obs">{{ aluno.observacoes }}</div>
        </div>
      </div>

      <div class="aluno-identidade-acoes">
        <div class="aluno-menu" @click.stop>
          <button type="button" class="btn btn-ghost aluno-menu-botao" title="Mais ações" :aria-expanded="menuAberto" @click="menuAberto = !menuAberto">⋯</button>
          <div v-if="menuAberto" class="aluno-menu-lista">
            <button type="button" @click="iniciarEdicao">Editar cadastro</button>
            <button type="button" :disabled="enviandoFoto" @click="selecionarFoto">{{ enviandoFoto ? 'Enviando foto…' : (fotoUrl ? 'Trocar foto' : 'Enviar foto') }}</button>
            <button v-if="fotoUrl" type="button" :disabled="removendoFoto" @click="removerFoto">Remover foto</button>
            <button type="button" @click="alternarAtivo">{{ aluno.ativo ? 'Marcar como inativo' : 'Marcar como ativo' }}</button>
            <button type="button" class="aluno-menu-perigo" @click="excluirAluno">Excluir aluno</button>
          </div>
        </div>
      </div>
    </div>

    <div class="filter-tabs aluno-abas">
      <button
        v-for="aba in ABAS"
        :key="aba.id"
        type="button"
        class="filter-tab"
        :class="{ active: abaAtiva === aba.id }"
        @click="trocarAba(aba.id)"
      >
        {{ aba.label }}
      </button>
    </div>

    <AcompanhamentoAluno v-if="abaAtiva === 'acompanhamento'" :id="props.id" />
    <FichaTreinoSecao v-else-if="abaAtiva === 'ficha'" :id="props.id" />
    <AvaliacoesFisicasSecao v-else-if="abaAtiva === 'avaliacoes'" :id="props.id" />

    <div v-if="editando" class="sheet-overlay open" style="position: fixed;" @click.self="editando = false">
      <div class="card" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 380px; max-width: calc(100vw - 32px); padding: 22px;">
        <h3 style="margin-bottom: 14px;">Editar cadastro</h3>
        <form @submit.prevent="salvarEdicao">
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
            <div class="form-field" style="width: 120px;">
              <label>Sexo</label>
              <select v-model="sexoEdit">
                <option value="">—</option>
                <option value="F">Feminino</option>
                <option value="M">Masculino</option>
              </select>
            </div>
          </div>
          <div class="form-field" style="margin-bottom: 16px;">
            <label>Observações</label>
            <textarea v-model="observacoesEdit" rows="2"></textarea>
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-ghost" @click="editando = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="salvando || !nomeEdit.trim()">Salvar</button>
          </div>
        </form>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
  <div v-else-if="!carregando" class="empty-state">Aluno não encontrado.</div>
</template>

<style scoped>
.aluno-identidade {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  padding: 18px 20px;
  margin-bottom: 22px;
}
.aluno-identidade-pessoa {
  display: flex;
  align-items: center;
  gap: 16px;
}
/* Avatar maior só nesta tela (a lista de Alunos mantém o .sz-lg padrão). */
.aluno-identidade .avatar.sz-lg {
  width: 72px;
  height: 72px;
  font-size: 24px;
  flex: none;
}
.aluno-identidade-nome {
  display: flex;
  align-items: center;
  gap: 8px;
}
.aluno-identidade-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-faint);
}
.aluno-identidade-obs {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.aluno-identidade-acoes {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.aluno-abas {
  margin-bottom: 20px;
}
.aluno-menu {
  position: relative;
}
.aluno-menu-botao {
  font-size: 18px;
  line-height: 1;
  padding: 8px 12px;
}
.aluno-menu-lista {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  min-width: 190px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 6px;
  display: flex;
  flex-direction: column;
}
.aluno-menu-lista button {
  text-align: left;
  padding: 9px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.aluno-menu-lista button:hover:not(:disabled) {
  background: var(--color-surface-alt);
}
.aluno-menu-lista button:disabled {
  opacity: .6;
  cursor: default;
}
.aluno-menu-lista .aluno-menu-perigo {
  color: var(--color-danger);
}
</style>
