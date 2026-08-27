<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import alunosService from '../../services/alunos.service.js'
import registrosService from '../../services/registros.service.js'
import { corParaId, iniciais, statusMeta, formatarData } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'

const props = defineProps({ id: { type: String, required: true } })
const router = useRouter()
const { toasts, showToast } = useToasts()

const aluno = ref(null)
const registros = ref([])
const carregando = ref(true)
const fotoUrl = ref(null)

const editando = ref(false)
const nomeEdit = ref('')
const telefoneEdit = ref('')
const observacoesEdit = ref('')
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
    const [dadosAluno, todosRegistros] = await Promise.all([alunosService.obter(props.id), registrosService.listar({})])
    aluno.value = dadosAluno
    registros.value = todosRegistros.filter((r) => r.aluno_id === props.id)
    await carregarFoto()
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)
onBeforeUnmount(() => {
  if (fotoUrl.value) URL.revokeObjectURL(fotoUrl.value)
})

const confirmados = computed(() => registros.value.filter((r) => r.status === 'confirmado'))
const emAndamento = computed(() => registros.value.filter((r) => r.status !== 'confirmado'))

function iniciarEdicao() {
  nomeEdit.value = aluno.value.nome
  telefoneEdit.value = aluno.value.telefone || ''
  observacoesEdit.value = aluno.value.observacoes || ''
  editando.value = true
}

async function salvarEdicao() {
  if (!nomeEdit.value.trim()) return
  salvando.value = true
  try {
    aluno.value = await alunosService.atualizar(props.id, {
      nome: nomeEdit.value.trim(),
      telefone: telefoneEdit.value.trim() || null,
      observacoes: observacoesEdit.value.trim() || null
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
  if (!window.confirm(`Excluir ${aluno.value.nome}? Isso também remove todos os relatos e avaliações deste aluno. Essa ação não pode ser desfeita.`)) return
  try {
    await alunosService.excluir(props.id)
    showToast('Aluno excluído.', 'neutral')
    router.push({ name: 'admin-alunos' })
  } catch (_err) {
    showToast('Não foi possível excluir o aluno.', 'warning')
  }
}

// Cards expansíveis (mesmo padrão de RegistrosView/HistoricoView) - só um
// Registro por vez, `listar()` só traz entradas leves (ver
// registro.repository.js), então a 1a expansão busca o detalhe completo.
const expandidoId = ref(null)

async function alternarExpandido(registro) {
  expandidoId.value = expandidoId.value === registro.id ? null : registro.id
  if (expandidoId.value !== registro.id) return

  if (!registro.detalhado) {
    try {
      const detalhe = await registrosService.obter(registro.id)
      registro.entradas = detalhe.entradas || []
      registro.validacao = detalhe.validacao
      registro.detalhado = true
    } catch (_err) {
      return // sem detalhe disponível - fica só com o resumo do card
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

function itensConfirmados(registro) {
  return registro.validacao?.payload_confirmado_json?.itens || []
}
function notaGeralConfirmada(registro) {
  return registro.validacao?.payload_confirmado_json?.notaGeral || ''
}
</script>

<template>
  <div v-if="aluno">
    <router-link class="detail-back" :to="{ name: 'admin-alunos' }">← Voltar para Alunos</router-link>
    <div class="detail-header">
      <div style="position: relative;">
        <img v-if="fotoUrl" :src="fotoUrl" class="avatar sz-lg" alt="" />
        <span v-else class="avatar sz-lg" :style="{ background: corParaId(aluno.id) }">{{ iniciais(aluno.nome) }}</span>
        <button type="button" class="btn btn-ghost" style="position: absolute; bottom: -8px; right: -8px; padding: 2px 6px; font-size: 11px;" :disabled="enviandoFoto" @click="selecionarFoto">
          📷
        </button>
        <button
          v-if="fotoUrl"
          type="button"
          class="btn btn-ghost"
          title="Remover foto"
          style="position: absolute; bottom: -8px; left: -8px; padding: 2px 6px; font-size: 11px;"
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
            <div style="display: flex; gap: 10px;">
              <button type="button" class="btn btn-secondary" @click="iniciarEdicao">Editar</button>
              <button type="button" class="btn btn-danger-ghost" @click="excluirAluno">Excluir aluno</button>
            </div>
            <router-link class="btn btn-primary" :to="{ name: 'admin-aluno-ficha-treino', params: { id: props.id } }">📋 Ficha de Treino</router-link>
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

    <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
      Relatos em andamento
    </p>
    <div class="registros-list" style="margin-bottom: 26px;">
      <div v-if="!emAndamento.length" class="card empty-state">Nenhum relato em aberto.</div>
      <div
        v-for="registro in emAndamento"
        :key="registro.id"
        class="card registro-card row-clickable"
        @click="alternarExpandido(registro)"
      >
        <div class="registro-card-head">
          <div class="registro-card-who">
            <span class="list-row-title">{{ formatarData(registro.created_at) }} — {{ registro.titulo || 'Registro' }}</span>
          </div>
          <span class="badge" :class="'badge-' + statusMeta(registro.status).badge">{{ statusMeta(registro.status).icon }} {{ statusMeta(registro.status).label }}</span>
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
    </div>

    <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
      Histórico confirmado
    </p>
    <div class="registros-list">
      <div v-if="!confirmados.length" class="card empty-state">Sem registros confirmados ainda.</div>
      <div
        v-for="registro in confirmados"
        :key="registro.id"
        class="card registro-card row-clickable"
        @click="alternarExpandido(registro)"
      >
        <div class="registro-card-head">
          <div class="registro-card-who">
            <span class="list-row-title">{{ registro.titulo || 'Registro' }}</span>
            <span class="list-row-sub">
              Confirmado em {{ formatarData(registro.validacao?.confirmado_em || registro.created_at) }} ·
              {{ registro.validacao?.payload_confirmado_json?.itens?.length || 0 }} item(ns)
            </span>
          </div>
          <span class="badge badge-success">Confirmado</span>
        </div>

        <div v-if="expandidoId === registro.id" class="transcript-box open" @click.stop>
          <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
            Entradas originais
          </p>
          <div v-for="entrada in registro.entradas || []" :key="entrada.id" class="source-entry">
            <span class="source-entry-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
            <div class="source-entry-body">
              <div class="source-entry-meta">{{ entrada.tipo === 'audio' ? `Áudio${entrada.duracao_segundos ? ' · ' + entrada.duracao_segundos + 's' : ''}` : 'Texto' }}</div>
              <template v-if="entrada.tipo === 'audio'">
                <audio v-if="entrada.audioUrl" :src="entrada.audioUrl" controls class="source-entry-audio"></audio>
                <span v-else class="source-entry-text" style="font-style: normal;">Áudio indisponível.</span>
                <div class="source-entry-text">
                  <template v-if="entrada.arquivoAudio?.transcricao?.texto">"{{ entrada.arquivoAudio.transcricao.texto }}"</template>
                  <span v-else style="font-style: normal; color: var(--color-text-faint);">Transcrição não disponível.</span>
                </div>
              </template>
              <div v-else class="source-entry-text">"{{ entrada.conteudo_texto }}"</div>
            </div>
          </div>

          <div v-if="notaGeralConfirmada(registro)" class="exercise-obs" style="margin-top: 14px;">Nota geral: {{ notaGeralConfirmada(registro) }}</div>

          <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 18px 0 10px;">
            Itens confirmados
          </p>
          <div v-if="!itensConfirmados(registro).length" class="empty-state" style="padding: 20px;">Nenhum item confirmado neste registro.</div>
          <div v-for="(item, indice) in itensConfirmados(registro)" :key="indice" class="exercise-card">
            <div class="exercise-card-top">
              <div>
                <div class="exercise-name">{{ item.label }}</div>
                <div class="exercise-meta">{{ item.valor }}</div>
              </div>
            </div>
            <div class="exercise-obs" :class="{ empty: !item.obs }">Observação: {{ item.obs }}</div>
          </div>
        </div>
      </div>
    </div>

    <ToastStack :toasts="toasts" />
  </div>
  <div v-else-if="!carregando" class="empty-state">Aluno não encontrado.</div>
</template>
