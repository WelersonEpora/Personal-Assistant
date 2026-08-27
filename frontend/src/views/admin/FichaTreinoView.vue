<script setup>
import { ref, computed, onMounted } from 'vue'
import alunosService from '../../services/alunos.service.js'
import exerciciosService from '../../services/exercicios.service.js'
import fichasTreinoService from '../../services/fichasTreino.service.js'
import { formatarData } from '../../utils/registroStatus.js'
import { useToasts } from '../../composables/useToasts.js'
import ToastStack from '../../components/ToastStack.vue'
import ExercicioMidia from '../../components/ExercicioMidia.vue'

const props = defineProps({ id: { type: String, required: true } })
const { toasts, showToast } = useToasts()

const aluno = ref(null)
const catalogo = ref([])
const fichas = ref([])
const carregando = ref(true)

const editando = ref(false)
const formNome = ref('')
const formObservacoes = ref('')
const itensForm = ref([])
const exercicioParaAdicionar = ref('')
const salvando = ref(false)

const fichaAtiva = computed(() => fichas.value.find((f) => f.ativo) || null)
const historico = computed(() => fichas.value.filter((f) => !f.ativo))
const expandidoId = ref(null)

// Link temporário de acesso do aluno à ficha (docs/adr/0014).
const link = ref(null)
const linkOcupado = ref(false)
const linkUrl = computed(() => (link.value ? `${window.location.origin}/ficha/${link.value.token}` : ''))
const LINK_STATUS_META = {
  ativo: { label: 'Ativo', badge: 'badge-success' },
  expirado: { label: 'Expirado', badge: 'badge-neutral' },
  revogado: { label: 'Revogado', badge: 'badge-neutral' }
}

function formatarValidade(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function carregar() {
  carregando.value = true
  try {
    const [dadosAluno, dadosCatalogo, dadosFichas, dadosLink] = await Promise.all([
      alunosService.obter(props.id),
      exerciciosService.listar(),
      fichasTreinoService.listarPorAluno(props.id),
      fichasTreinoService.obterLink(props.id).catch(() => null)
    ])
    aluno.value = dadosAluno
    catalogo.value = dadosCatalogo.filter((e) => e.ativo)
    fichas.value = dadosFichas
    link.value = dadosLink
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

async function gerarLink() {
  if (link.value?.status === 'ativo' && !window.confirm('Gerar um novo link invalida o link atual. Continuar?')) return
  linkOcupado.value = true
  try {
    link.value = await fichasTreinoService.gerarLink(props.id)
    showToast('Link gerado. Copie e envie para o aluno.', 'success')
  } catch (_err) {
    showToast('Não foi possível gerar o link.', 'warning')
  } finally {
    linkOcupado.value = false
  }
}

async function copiarLink() {
  try {
    await navigator.clipboard.writeText(linkUrl.value)
    showToast('Link copiado.', 'success')
  } catch (_err) {
    showToast('Não foi possível copiar automaticamente — selecione e copie o link.', 'warning')
  }
}

async function revogarLink() {
  if (!window.confirm('Revogar o link? O aluno perde o acesso imediatamente.')) return
  linkOcupado.value = true
  try {
    await fichasTreinoService.revogarLink(props.id)
    link.value = null
    showToast('Link revogado.', 'neutral')
  } catch (_err) {
    showToast('Não foi possível revogar o link.', 'warning')
  } finally {
    linkOcupado.value = false
  }
}

function iniciarEdicao() {
  formNome.value = fichaAtiva.value?.nome || ''
  formObservacoes.value = fichaAtiva.value?.observacoes || ''
  itensForm.value = (fichaAtiva.value?.itens || []).map((item) => ({
    exercicioId: item.exercicio.id,
    nome: item.exercicio.nome,
    grupoMuscular: item.exercicio.grupo_muscular,
    temImagemInicio: Boolean(item.exercicio.midia_imagem_inicio_caminho),
    temImagemFim: Boolean(item.exercicio.midia_imagem_fim_caminho),
    midiaVideoUrl: item.exercicio.midia_video_url,
    instrucoes: item.exercicio.instrucoes,
    series: item.series ?? '',
    repeticoes: item.repeticoes || '',
    cargaObs: item.carga_obs || ''
  }))
  editando.value = true
}

function cancelarEdicao() {
  editando.value = false
}

function adicionarItem() {
  if (!exercicioParaAdicionar.value) return
  if (itensForm.value.some((item) => item.exercicioId === exercicioParaAdicionar.value)) {
    showToast('Este exercício já está na ficha.', 'warning')
    return
  }
  const exercicio = catalogo.value.find((e) => e.id === exercicioParaAdicionar.value)
  itensForm.value.push({
    exercicioId: exercicio.id,
    nome: exercicio.nome,
    grupoMuscular: exercicio.grupo_muscular,
    temImagemInicio: Boolean(exercicio.midia_imagem_inicio_caminho),
    temImagemFim: Boolean(exercicio.midia_imagem_fim_caminho),
    midiaVideoUrl: exercicio.midia_video_url,
    instrucoes: exercicio.instrucoes,
    series: '',
    repeticoes: '',
    cargaObs: ''
  })
  exercicioParaAdicionar.value = ''
}

function removerItem(indice) {
  itensForm.value.splice(indice, 1)
}

function mover(indice, direcao) {
  const alvo = indice + direcao
  if (alvo < 0 || alvo >= itensForm.value.length) return
  const [item] = itensForm.value.splice(indice, 1)
  itensForm.value.splice(alvo, 0, item)
}

async function salvarNovaVersao() {
  if (!itensForm.value.length) return
  salvando.value = true
  try {
    await fichasTreinoService.criarNovaVersao(props.id, {
      nome: formNome.value.trim() || null,
      observacoes: formObservacoes.value.trim() || null,
      itens: itensForm.value.map((item) => ({
        exercicioId: item.exercicioId,
        series: item.series !== '' ? Number(item.series) : null,
        repeticoes: item.repeticoes.trim() || null,
        cargaObs: item.cargaObs.trim() || null
      }))
    })
    editando.value = false
    showToast('Ficha de treino salva.', 'success')
    await carregar()
  } catch (_err) {
    showToast('Não foi possível salvar a ficha de treino.', 'warning')
  } finally {
    salvando.value = false
  }
}

function alternarExpandido(ficha) {
  expandidoId.value = expandidoId.value === ficha.id ? null : ficha.id
}

function metaItem(item) {
  const partes = []
  if (item.series) partes.push(`${item.series} série(s)`)
  if (item.repeticoes) partes.push(`${item.repeticoes} repetições`)
  if (item.exercicio.grupo_muscular) partes.push(item.exercicio.grupo_muscular)
  return partes.join(' · ')
}
</script>

<template>
  <div v-if="aluno">
    <router-link class="detail-back" :to="{ name: 'admin-aluno-detalhe', params: { id: props.id } }">← Voltar para {{ aluno.nome }}</router-link>

    <div class="view-header">
      <div>
        <h1>Ficha de Treino</h1>
        <p>{{ aluno.nome }}</p>
      </div>
      <button v-if="!editando" type="button" class="btn btn-primary" @click="iniciarEdicao">
        {{ fichaAtiva ? 'Nova versão da ficha' : 'Criar ficha' }}
      </button>
    </div>

    <div v-if="!editando" class="card card-pad" style="margin-bottom: 26px;">
      <div style="font-size: 15px; font-weight: 700; margin-bottom: 4px;">🔗 Link para o aluno</div>
      <p class="list-row-sub" style="margin-bottom: 12px;">
        Acesso somente leitura à ficha ativa, sem login. Validade de 7 dias; gerar um novo invalida o anterior.
      </p>

      <template v-if="link">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
          <span class="badge" :class="(LINK_STATUS_META[link.status] || {}).badge || 'badge-neutral'">
            {{ (LINK_STATUS_META[link.status] || {}).label || link.status }}
          </span>
          <span class="list-row-sub">
            {{ link.status === 'revogado' ? 'Revogado em' : 'Expira em' }}
            {{ formatarValidade(link.status === 'revogado' ? link.revogado_em : link.expira_em) }}
          </span>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px;">
          <input
            type="text"
            :value="linkUrl"
            readonly
            aria-label="Link de acesso do aluno"
            @focus="$event.target.select()"
            style="flex: 1; min-width: 0; font-size: 13px;"
          />
          <button type="button" class="btn btn-secondary" :disabled="link.status !== 'ativo'" @click="copiarLink">Copiar</button>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="btn btn-ghost" :disabled="linkOcupado" @click="gerarLink">Gerar novo link</button>
          <button
            v-if="link.status === 'ativo'"
            type="button"
            class="btn btn-danger-ghost"
            :disabled="linkOcupado"
            @click="revogarLink"
          >
            Revogar
          </button>
        </div>
      </template>
      <button v-else type="button" class="btn btn-primary" :disabled="linkOcupado" @click="gerarLink">
        Gerar link para o aluno
      </button>
    </div>

    <template v-if="!editando">
      <div v-if="fichaAtiva" class="card card-pad" style="margin-bottom: 26px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; gap: 12px;">
          <div>
            <div style="font-size: 15px; font-weight: 700;">{{ fichaAtiva.nome || 'Ficha de treino' }}</div>
            <div class="list-row-sub">Criada em {{ formatarData(fichaAtiva.created_at) }} por {{ fichaAtiva.criadoPor?.nome }}</div>
          </div>
          <span class="badge badge-success">Ativa</span>
        </div>
        <div v-if="fichaAtiva.observacoes" class="exercise-obs" style="margin-bottom: 14px;">{{ fichaAtiva.observacoes }}</div>
        <div v-for="item in fichaAtiva.itens" :key="item.id" class="exercise-card">
          <div class="exercise-card-top">
            <div style="display: flex; align-items: center; gap: 12px;">
              <ExercicioMidia
                :exercicio-id="item.exercicio.id"
                :tem-inicio="Boolean(item.exercicio.midia_imagem_inicio_caminho)"
                :tem-fim="Boolean(item.exercicio.midia_imagem_fim_caminho)"
                :video-url="item.exercicio.midia_video_url"
                :instrucoes="item.exercicio.instrucoes"
                :nome="item.exercicio.nome"
                size="md"
              />
              <div>
                <div class="exercise-name">{{ item.exercicio.nome }}</div>
                <div class="exercise-meta">{{ metaItem(item) }}</div>
              </div>
            </div>
          </div>
          <div class="exercise-obs" :class="{ empty: !item.carga_obs }">Carga / observações: {{ item.carga_obs }}</div>
        </div>
      </div>
      <div v-else class="card empty-state" style="margin-bottom: 26px;">
        <div class="empty-state-icon">📋</div>Nenhuma ficha de treino ativa ainda.
      </div>

      <p style="font-size: 12px; font-weight: 700; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: .03em; margin: 0 0 10px;">
        Fichas anteriores
      </p>
      <div v-if="!historico.length" class="card empty-state">Nenhuma ficha anterior.</div>
      <div class="registros-list">
        <div v-for="ficha in historico" :key="ficha.id" class="card registro-card row-clickable" @click="alternarExpandido(ficha)">
          <div class="registro-card-head">
            <div class="registro-card-who">
              <span class="list-row-title">{{ ficha.nome || 'Ficha de treino' }}</span>
              <span class="list-row-sub">Criada em {{ formatarData(ficha.created_at) }} · {{ ficha.itens.length }} exercício(s)</span>
            </div>
            <span class="badge badge-neutral">Substituída</span>
          </div>
          <div v-if="expandidoId === ficha.id" class="transcript-box open" @click.stop>
            <div v-for="item in ficha.itens" :key="item.id" class="exercise-card">
              <div class="exercise-card-top">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <ExercicioMidia
                    :exercicio-id="item.exercicio.id"
                    :tem-inicio="Boolean(item.exercicio.midia_imagem_inicio_caminho)"
                    :tem-fim="Boolean(item.exercicio.midia_imagem_fim_caminho)"
                    :video-url="item.exercicio.midia_video_url"
                    :instrucoes="item.exercicio.instrucoes"
                    :nome="item.exercicio.nome"
                    size="md"
                  />
                  <div>
                    <div class="exercise-name">{{ item.exercicio.nome }}</div>
                    <div class="exercise-meta">{{ metaItem(item) }}</div>
                  </div>
                </div>
              </div>
              <div class="exercise-obs" :class="{ empty: !item.carga_obs }">Carga / observações: {{ item.carga_obs }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="card card-pad">
        <div class="form-field" style="max-width: 420px; margin-bottom: 12px;">
          <label>Nome da ficha (opcional)</label>
          <input v-model="formNome" type="text" placeholder="Ex.: Treino A - Superior" />
        </div>
        <div class="form-field" style="max-width: 420px; margin-bottom: 20px;">
          <label>Observações (opcional)</label>
          <textarea v-model="formObservacoes" rows="2"></textarea>
        </div>

        <div style="display: flex; gap: 10px; align-items: flex-end; margin-bottom: 20px; max-width: 560px;">
          <div class="form-field" style="flex: 1;">
            <label>Adicionar exercício do catálogo</label>
            <select v-model="exercicioParaAdicionar">
              <option value="">Selecione um exercício...</option>
              <option v-for="ex in catalogo" :key="ex.id" :value="ex.id">{{ ex.nome }}{{ ex.equipe_id ? '' : ' (global)' }}</option>
            </select>
          </div>
          <button type="button" class="btn btn-secondary" :disabled="!exercicioParaAdicionar" @click="adicionarItem">+ Adicionar</button>
        </div>

        <div v-if="!itensForm.length" class="empty-state" style="padding: 24px;">Nenhum exercício adicionado ainda.</div>
        <div v-for="(item, indice) in itensForm" :key="item.exercicioId" class="exercise-card">
          <div class="exercise-card-top">
            <div style="display: flex; align-items: center; gap: 12px;">
              <ExercicioMidia
                :exercicio-id="item.exercicioId"
                :tem-inicio="item.temImagemInicio"
                :tem-fim="item.temImagemFim"
                :video-url="item.midiaVideoUrl"
                :instrucoes="item.instrucoes"
                :nome="item.nome"
                size="md"
              />
              <div>
                <div class="exercise-name">{{ item.nome }}</div>
                <div class="exercise-meta">{{ item.grupoMuscular }}</div>
              </div>
            </div>
            <button type="button" class="exercise-remove" @click="removerItem(indice)">Remover</button>
          </div>
          <div class="field-row" style="grid-template-columns: 1fr 1fr 2fr;">
            <div class="field-group">
              <label>Séries</label>
              <input v-model="item.series" type="number" min="1" />
            </div>
            <div class="field-group">
              <label>Repetições</label>
              <input v-model="item.repeticoes" type="text" placeholder="Ex.: 8-12" />
            </div>
            <div class="field-group obs-field">
              <label>Carga / observações</label>
              <input v-model="item.cargaObs" type="text" placeholder="Ex.: 20kg, aumentar progressivamente" />
            </div>
          </div>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button type="button" class="btn btn-ghost btn-sm" :disabled="indice === 0" @click="mover(indice, -1)">↑ Subir</button>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="indice === itensForm.length - 1" @click="mover(indice, 1)">↓ Descer</button>
          </div>
        </div>

        <div class="revisao-actions">
          <button type="button" class="btn btn-ghost" @click="cancelarEdicao">Cancelar</button>
          <button type="button" class="btn btn-primary" :disabled="salvando || !itensForm.length" @click="salvarNovaVersao">Salvar ficha</button>
        </div>
      </div>
    </template>

    <ToastStack :toasts="toasts" />
  </div>
  <div v-else-if="!carregando" class="empty-state">Aluno não encontrado.</div>
</template>
