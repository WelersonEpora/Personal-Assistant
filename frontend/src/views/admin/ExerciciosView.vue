<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import exerciciosService from '../../services/exercicios.service.js'
import { useAuthStore } from '../../stores/auth.store.js'
import { useToasts } from '../../composables/useToasts.js'
import { useConfirm } from '../../composables/useConfirm.js'
import ToastStack from '../../components/ToastStack.vue'
import ExercicioMidia from '../../components/ExercicioMidia.vue'
import FiltroSegmentado from '../../components/FiltroSegmentado.vue'

const OPCOES_ORIGEM = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'globais', rotulo: 'Globais' },
  { valor: 'proprios', rotulo: 'Da minha equipe' }
]

const DIFICULDADES = [
  { valor: 'iniciante', label: 'Iniciante' },
  { valor: 'intermediario', label: 'Intermediário' },
  { valor: 'avancado', label: 'Avançado' }
]
const POSICOES = [
  { valor: 'inicio', label: 'Posição inicial' },
  { valor: 'fim', label: 'Posição final' }
]

const auth = useAuthStore()
const { toasts, showToast } = useToasts()
const { confirmar } = useConfirm()

const exercicios = ref([])
const carregando = ref(true)
const busca = ref('')
const filtroOrigem = ref('todos') // todos | globais | proprios

const modalAberto = ref(false)
const editando = ref(null) // null = criando; senão, o exercício em edição
const salvando = ref(false)
const form = ref(vazio())

function vazio() {
  return { nome: '', grupoMuscular: '', equipamento: '', dificuldade: '', instrucoes: '', midiaVideoUrl: '' }
}

async function carregar() {
  carregando.value = true
  try {
    exercicios.value = await exerciciosService.listar()
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

function ehProprio(exercicio) {
  return exercicio.equipe_id === auth.usuario?.equipe?.id
}

// TEMPORÁRIO: "Editar" fica habilitado também para exercícios globais (o
// backend aceita, ver exercicio.service.js::getExercicioEditavel) enquanto
// um personal parceiro revisa/corrige o catálogo global. "Excluir" continua
// só para próprios - apagar um global afeta todas as equipes do sistema.

const filtrados = computed(() => {
  const termo = busca.value.trim().toLowerCase()
  return exercicios.value.filter((exercicio) => {
    if (filtroOrigem.value === 'globais' && exercicio.equipe_id) return false
    if (filtroOrigem.value === 'proprios' && !ehProprio(exercicio)) return false
    if (!termo) return true
    return (
      exercicio.nome.toLowerCase().includes(termo) ||
      (exercicio.grupo_muscular || '').toLowerCase().includes(termo) ||
      (exercicio.equipamento || '').toLowerCase().includes(termo)
    )
  })
})

// Preview das duas imagens dentro do modal de edição (upload próprio, não
// reaproveita ExercicioMidia aqui - essa é só leitura/lightbox de exibição).
const previewUrls = ref({ inicio: null, fim: null })
const enviandoImagem = ref({ inicio: false, fim: false })
const removendoImagem = ref({ inicio: false, fim: false })
const inputsImagem = {}

function revogarPreviews() {
  Object.values(previewUrls.value).forEach((url) => url && URL.revokeObjectURL(url))
  previewUrls.value = { inicio: null, fim: null }
}
onBeforeUnmount(revogarPreviews)

async function carregarPreview(posicao) {
  const caminho = posicao === 'inicio' ? editando.value?.midia_imagem_inicio_caminho : editando.value?.midia_imagem_fim_caminho
  if (!caminho) return
  try {
    const blob = await exerciciosService.obterImagem(editando.value.id, posicao)
    previewUrls.value[posicao] = URL.createObjectURL(blob)
  } catch (_err) {
    // sem imagem disponível - fica só com o placeholder
  }
}

function abrirCriacao() {
  editando.value = null
  form.value = vazio()
  revogarPreviews()
  modalAberto.value = true
}

function abrirEdicao(exercicio) {
  editando.value = exercicio
  form.value = {
    nome: exercicio.nome,
    grupoMuscular: exercicio.grupo_muscular || '',
    equipamento: exercicio.equipamento || '',
    dificuldade: exercicio.dificuldade || '',
    instrucoes: exercicio.instrucoes || '',
    midiaVideoUrl: exercicio.midia_video_url || ''
  }
  revogarPreviews()
  carregarPreview('inicio')
  carregarPreview('fim')
  modalAberto.value = true
}

async function salvar() {
  if (!form.value.nome.trim()) return
  salvando.value = true
  try {
    const dados = {
      nome: form.value.nome.trim(),
      grupoMuscular: form.value.grupoMuscular.trim() || null,
      equipamento: form.value.equipamento.trim() || null,
      dificuldade: form.value.dificuldade || null,
      instrucoes: form.value.instrucoes.trim() || null,
      midiaVideoUrl: form.value.midiaVideoUrl.trim() || null
    }
    if (editando.value) {
      await exerciciosService.atualizar(editando.value.id, dados)
      showToast('Exercício atualizado.', 'success')
    } else {
      await exerciciosService.criar(dados)
      showToast('Exercício cadastrado.', 'success')
    }
    modalAberto.value = false
    await carregar()
  } catch (_err) {
    showToast('Não foi possível salvar o exercício.', 'warning')
  } finally {
    salvando.value = false
  }
}

// Upload/remoção de imagem acontecem fora do form de "Salvar" (mesmo
// critério de foto de aluno) - sem isto, a tabela ficaria com a miniatura
// desatualizada até um recarregamento manual da página.
function sincronizarNaLista(exercicioAtualizado) {
  const indice = exercicios.value.findIndex((e) => e.id === exercicioAtualizado.id)
  if (indice !== -1) exercicios.value[indice] = exercicioAtualizado
}

function selecionarImagem(posicao) {
  inputsImagem[posicao]?.click()
}

async function onImagemSelecionada(posicao, evento) {
  const arquivo = evento.target.files?.[0]
  evento.target.value = ''
  if (!arquivo || !editando.value) return
  enviandoImagem.value[posicao] = true
  try {
    editando.value = await exerciciosService.enviarImagem(editando.value.id, posicao, arquivo)
    sincronizarNaLista(editando.value)
    if (previewUrls.value[posicao]) URL.revokeObjectURL(previewUrls.value[posicao])
    previewUrls.value[posicao] = null
    await carregarPreview(posicao)
    showToast('Imagem atualizada.', 'success')
  } catch (_err) {
    showToast('Não foi possível enviar a imagem (use JPEG, PNG ou WebP, até 5MB).', 'warning')
  } finally {
    enviandoImagem.value[posicao] = false
  }
}

async function removerImagemDoExercicio(posicao) {
  if (!editando.value) return
  removendoImagem.value[posicao] = true
  try {
    editando.value = await exerciciosService.removerImagem(editando.value.id, posicao)
    sincronizarNaLista(editando.value)
    if (previewUrls.value[posicao]) URL.revokeObjectURL(previewUrls.value[posicao])
    previewUrls.value[posicao] = null
    showToast('Imagem removida.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível remover a imagem.', 'warning')
  } finally {
    removendoImagem.value[posicao] = false
  }
}

async function alternarAtivo(exercicio) {
  try {
    await exerciciosService.atualizar(exercicio.id, { ativo: !exercicio.ativo })
    exercicio.ativo = !exercicio.ativo
  } catch (_err) {
    showToast('Não foi possível atualizar o status do exercício.', 'warning')
  }
}

async function excluir(exercicio) {
  const ok = await confirmar({
    titulo: `Excluir "${exercicio.nome}" do catálogo?`,
    mensagem: 'Fichas de treino que já usam este exercício não são afetadas.',
    perigo: true
  })
  if (!ok) return
  try {
    await exerciciosService.excluir(exercicio.id)
    showToast('Exercício excluído.', 'neutral')
    await carregar()
  } catch (_err) {
    showToast('Não foi possível excluir o exercício.', 'warning')
  }
}

function rotuloDificuldade(valor) {
  return DIFICULDADES.find((d) => d.valor === valor)?.label || '—'
}
</script>

<template>
  <div>
    <div class="view-header">
      <div>
        <h1>Exercícios</h1>
        <p>Catálogo de exercícios usado para montar a Ficha de Treino dos alunos.</p>
      </div>
      <button class="btn btn-primary" type="button" @click="abrirCriacao">+ Novo exercício</button>
    </div>

    <div class="card" style="margin-bottom: 20px;">
      <div class="table-toolbar">
        <FiltroSegmentado v-model="filtroOrigem" :opcoes="OPCOES_ORIGEM" rotulo="Origem" />
        <input v-model="busca" type="search" class="search-input" placeholder="Buscar por nome, grupo ou equipamento..." />
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th></th>
              <th>Nome</th>
              <th>Grupo muscular</th>
              <th>Equipamento</th>
              <th>Dificuldade</th>
              <th>Origem</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="exercicio in filtrados" :key="exercicio.id">
              <td>
                <ExercicioMidia
                  :key="`${exercicio.id}-${exercicio.updated_at}`"
                  :exercicio-id="exercicio.id"
                  :tem-inicio="Boolean(exercicio.midia_imagem_inicio_caminho)"
                  :tem-fim="Boolean(exercicio.midia_imagem_fim_caminho)"
                  :video-url="exercicio.midia_video_url"
                  :instrucoes="exercicio.instrucoes"
                  :nome="exercicio.nome"
                />
              </td>
              <td>{{ exercicio.nome }}</td>
              <td>{{ exercicio.grupo_muscular || '—' }}</td>
              <td>{{ exercicio.equipamento || '—' }}</td>
              <td>{{ rotuloDificuldade(exercicio.dificuldade) }}</td>
              <td><span class="badge" :class="exercicio.equipe_id ? 'badge-info' : 'badge-neutral'">{{ exercicio.equipe_id ? 'Própria' : 'Global' }}</span></td>
              <td>
                <button
                  type="button"
                  class="badge"
                  style="border: none; cursor: pointer;"
                  :class="exercicio.ativo ? 'badge-success' : 'badge-neutral'"
                  :title="exercicio.ativo ? 'Marcar como inativo' : 'Marcar como ativo'"
                  @click="alternarAtivo(exercicio)"
                >
                  {{ exercicio.ativo ? 'Ativo' : 'Inativo' }}
                </button>
              </td>
              <td>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                  <button type="button" class="btn btn-ghost btn-sm" @click="abrirEdicao(exercicio)">Editar</button>
                  <button
                    v-if="ehProprio(exercicio)"
                    type="button"
                    class="btn btn-ghost btn-sm"
                    style="color: var(--color-danger, #dc2626);"
                    @click="excluir(exercicio)"
                  >
                    Excluir
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!carregando && !filtrados.length" class="empty-state">
        <div class="empty-state-icon">🏋️</div>Nenhum exercício encontrado.
      </div>
    </div>

    <div v-if="modalAberto" class="sheet-overlay open" style="position: fixed;" @click.self="modalAberto = false">
      <div class="card" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 480px; max-height: 86vh; overflow-y: auto; padding: 22px;">
        <h3 style="margin-bottom: 14px;">{{ editando ? 'Editar exercício' : 'Novo exercício' }}</h3>
        <form @submit.prevent="salvar">
          <div class="form-field" style="margin-bottom: 12px;">
            <label>Nome</label>
            <input v-model="form.nome" type="text" required autofocus />
          </div>
          <div class="field-row" style="grid-template-columns: 1fr 1fr; margin-bottom: 12px; margin-top: 0;">
            <div class="field-group">
              <label>Grupo muscular</label>
              <input v-model="form.grupoMuscular" type="text" placeholder="Ex.: Peito" />
            </div>
            <div class="field-group">
              <label>Equipamento</label>
              <input v-model="form.equipamento" type="text" placeholder="Ex.: Barra" />
            </div>
          </div>
          <div class="form-field" style="margin-bottom: 12px;">
            <label>Dificuldade</label>
            <select v-model="form.dificuldade">
              <option value="">Não informada</option>
              <option v-for="d in DIFICULDADES" :key="d.valor" :value="d.valor">{{ d.label }}</option>
            </select>
          </div>
          <div class="form-field" style="margin-bottom: 12px;">
            <label>Instruções</label>
            <textarea v-model="form.instrucoes" rows="3" placeholder="Como executar o exercício"></textarea>
          </div>

          <div v-if="editando" class="form-field" style="margin-bottom: 12px;">
            <label>Imagens (posição inicial / final do movimento)</label>
            <div style="display: flex; gap: 22px; margin-top: 6px;">
              <div v-for="p in POSICOES" :key="p.valor" style="text-align: center;">
                <div style="position: relative; display: inline-block;">
                  <img v-if="previewUrls[p.valor]" :src="previewUrls[p.valor]" class="avatar sz-lg" style="border-radius: var(--radius-sm); width: 180px; height: 150px;" alt="" />
                  <span v-else class="avatar sz-lg" style="border-radius: var(--radius-sm); background: var(--color-surface-alt); width: 180px; height: 150px; font-size: 44px;">🏋️</span>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    style="position: absolute; bottom: -8px; right: -8px; padding: 2px 6px; font-size: 11px;"
                    :disabled="enviandoImagem[p.valor]"
                    @click="selecionarImagem(p.valor)"
                  >
                    📷
                  </button>
                  <button
                    v-if="previewUrls[p.valor]"
                    type="button"
                    class="btn btn-ghost"
                    title="Remover imagem"
                    style="position: absolute; bottom: -8px; left: -8px; padding: 2px 6px; font-size: 11px;"
                    :disabled="removendoImagem[p.valor]"
                    @click="removerImagemDoExercicio(p.valor)"
                  >
                    🗑️
                  </button>
                  <input
                    :ref="(el) => (inputsImagem[p.valor] = el)"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style="display: none;"
                    @change="(e) => onImagemSelecionada(p.valor, e)"
                  />
                </div>
                <div style="font-size: 11px; color: var(--color-text-faint); margin-top: 6px;">{{ p.label }}</div>
              </div>
            </div>
          </div>
          <p v-else style="font-size: 12px; color: var(--color-text-faint); margin-bottom: 12px;">
            Salve o exercício primeiro para poder enviar as imagens.
          </p>

          <div class="form-field" style="margin-bottom: 16px;">
            <label>Link de vídeo (opcional)</label>
            <input v-model="form.midiaVideoUrl" type="url" placeholder="https://..." />
          </div>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button type="button" class="btn btn-ghost" @click="modalAberto = false">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="salvando || !form.nome.trim()">Salvar</button>
          </div>
        </form>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
</template>
