<script setup>
import { ref, computed, onMounted } from 'vue'
import exerciciosService from '../services/exercicios.service.js'
import fichasTreinoService from '../services/fichasTreino.service.js'
import alunosService from '../services/alunos.service.js'
import { formatarData } from '../utils/registroStatus.js'
import {
  formularioDaFicha,
  payloadDosGrupos,
  problemaDoFormulario,
  contarExercicios,
  situacaoInativa,
  ordenarPorNome
} from '../utils/fichaTreino.js'
import { useToasts } from '../composables/useToasts.js'
import { useConfirm } from '../composables/useConfirm.js'
import ToastStack from './ToastStack.vue'
import FichaGruposLeitura from './FichaGruposLeitura.vue'
import FichaTreinoEditor from './FichaTreinoEditor.vue'

// Seção "Ficha de Treino" da tela do aluno (docs/adr/0015 estendida): deixou
// de ser tela própria - vive num slot com abas no AlunoDetalheView. O contexto
// do aluno (nome, foto, status) fica no card de identidade acima.
// docs/adr/0026: várias fichas ativas (divisão de treino) e exercícios em
// grupos (bi-set, tri-set, circuito).
const props = defineProps({ id: { type: String, required: true } })
const { toasts, showToast } = useToasts()
const { confirmar } = useConfirm()

const catalogo = ref([])
const fichas = ref([])
const aluno = ref(null)
const carregando = ref(true)
const salvandoDispensa = ref(false)

// Aluno que não usa ficha de treino (docs/adr/0017): a seção fica recolhida e
// ele sai do alerta "sem ficha ativa" do painel. Não apaga fichas existentes.
const dispensaFicha = computed(() => aluno.value?.dispensa_ficha_treino === true)

// Editor: `fichaSubstituida` nula = ficha nova (soma às ativas); preenchida =
// nova versão daquela ficha.
const editando = ref(false)
const fichaSubstituida = ref(null)
const formNome = ref('')
const formObservacoes = ref('')
const gruposForm = ref([])
const salvando = ref(false)
const arquivandoId = ref(null)

const fichasAtivas = computed(() => ordenarPorNome(fichas.value.filter((f) => f.ativo)))
const historico = computed(() => fichas.value.filter((f) => !f.ativo))
const expandidoId = ref(null)

const SITUACAO_INATIVA = { substituida: 'Substituída', arquivada: 'Arquivada' }

// Link temporário de acesso do aluno às fichas (docs/adr/0014).
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

function mensagemDaApi(err, padrao) {
  return err?.response?.data?.error?.message || padrao
}

async function carregar() {
  carregando.value = true
  try {
    const [dadosCatalogo, dadosFichas, dadosLink, dadosAluno] = await Promise.all([
      exerciciosService.listar(),
      fichasTreinoService.listarPorAluno(props.id),
      fichasTreinoService.obterLink(props.id).catch(() => null),
      alunosService.obter(props.id)
    ])
    catalogo.value = dadosCatalogo.filter((e) => e.ativo)
    fichas.value = dadosFichas
    link.value = dadosLink
    aluno.value = dadosAluno
  } finally {
    carregando.value = false
  }
}
onMounted(carregar)

async function gerarLink() {
  if (
    link.value?.status === 'ativo' &&
    !(await confirmar({
      titulo: 'Gerar um novo link?',
      mensagem: 'Isso invalida o link atual imediatamente.',
      confirmarLabel: 'Gerar novo link'
    }))
  ) {
    return
  }
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
  const ok = await confirmar({
    titulo: 'Revogar o link?',
    mensagem: 'O aluno perde o acesso imediatamente.',
    perigo: true,
    confirmarLabel: 'Revogar'
  })
  if (!ok) return
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

function iniciarNovaFicha() {
  fichaSubstituida.value = null
  formNome.value = ''
  formObservacoes.value = ''
  gruposForm.value = []
  editando.value = true
}

function iniciarEdicao(ficha) {
  fichaSubstituida.value = ficha
  formNome.value = ficha.nome || ''
  formObservacoes.value = ficha.observacoes || ''
  gruposForm.value = formularioDaFicha(ficha)
  editando.value = true
}

function cancelarEdicao() {
  editando.value = false
}

async function arquivarFicha(ficha) {
  const ok = await confirmar({
    titulo: `Arquivar “${ficha.nome || 'Ficha de treino'}”?`,
    mensagem: 'A ficha sai das fichas ativas e do link do aluno, mas continua no histórico.',
    confirmarLabel: 'Arquivar'
  })
  if (!ok) return
  arquivandoId.value = ficha.id
  try {
    await fichasTreinoService.arquivar(ficha.id)
    showToast('Ficha arquivada.', 'neutral')
    await carregar()
  } catch (err) {
    showToast(mensagemDaApi(err, 'Não foi possível arquivar a ficha.'), 'warning')
  } finally {
    arquivandoId.value = null
  }
}

async function alternarDispensa() {
  const marcar = !dispensaFicha.value
  salvandoDispensa.value = true
  try {
    aluno.value = await alunosService.atualizar(props.id, { dispensa_ficha_treino: marcar })
    if (marcar) editando.value = false
    showToast(
      marcar ? 'Aluno marcado como “não usa ficha de treino”.' : 'Ficha de treino reativada para este aluno.',
      'neutral'
    )
  } catch (_err) {
    showToast('Não foi possível atualizar.', 'warning')
  } finally {
    salvandoDispensa.value = false
  }
}

// ----------------------------------------------------------- editor

async function salvarNovaVersao() {
  const problema = problemaDoFormulario({ nome: formNome.value, grupos: gruposForm.value })
  if (problema) {
    showToast(problema, 'warning')
    return
  }
  salvando.value = true
  try {
    await fichasTreinoService.criarNovaVersao(props.id, {
      nome: formNome.value.trim(),
      observacoes: formObservacoes.value.trim() || null,
      substituiFichaId: fichaSubstituida.value?.id || null,
      grupos: payloadDosGrupos(gruposForm.value)
    })
    editando.value = false
    showToast('Ficha de treino salva.', 'success')
    await carregar()
  } catch (err) {
    showToast(mensagemDaApi(err, 'Não foi possível salvar a ficha de treino.'), 'warning')
  } finally {
    salvando.value = false
  }
}

function alternarExpandido(ficha) {
  expandidoId.value = expandidoId.value === ficha.id ? null : ficha.id
}
</script>

<template>
  <div>
    <div class="secao-cabecalho">
      <h2 class="secao-titulo">Ficha de Treino</h2>
      <button v-if="!editando && !dispensaFicha" type="button" class="btn btn-primary" @click="iniciarNovaFicha">
        + Nova ficha
      </button>
    </div>

    <div v-if="carregando" class="empty-state">Carregando…</div>

    <template v-else>
      <label class="dispensa-toggle">
        <input type="checkbox" :checked="dispensaFicha" :disabled="salvandoDispensa" @change="alternarDispensa" />
        <span>Não usa ficha de treino</span>
      </label>

      <div v-if="dispensaFicha" class="card empty-state">
        <div class="empty-state-icon">🏋️</div>
        Este aluno não usa ficha de treino — fica fora do alerta “sem ficha ativa” do painel.
        <p v-if="fichas.length" class="list-row-sub" style="margin-top: 8px;">
          As {{ fichas.length }} ficha(s) já registradas continuam salvas e voltam a aparecer se você reativar.
        </p>
      </div>

      <template v-if="!dispensaFicha">
      <div v-if="!editando" class="card card-pad" style="margin-bottom: 26px;">
        <div style="font-size: 15px; font-weight: 700; margin-bottom: 4px;">🔗 Link para o aluno</div>
        <p class="list-row-sub" style="margin-bottom: 12px;">
          Acesso somente leitura a todas as fichas ativas, sem login. Validade de 7 dias; gerar um novo invalida o anterior.
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
              style="flex: 1; min-width: 0; font-size: 13px;"
              @focus="$event.target.select()"
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
        <div v-for="ficha in fichasAtivas" :key="ficha.id" class="card card-pad" style="margin-bottom: 18px;">
          <div class="ficha-cabecalho">
            <div>
              <div style="font-size: 15px; font-weight: 700;">{{ ficha.nome || 'Ficha de treino' }}</div>
              <div class="list-row-sub">Criada em {{ formatarData(ficha.created_at) }} por {{ ficha.criadoPor?.nome }}</div>
            </div>
            <div class="ficha-acoes">
              <span class="badge badge-success">Ativa</span>
              <button type="button" class="btn btn-secondary btn-sm" @click="iniciarEdicao(ficha)">Editar</button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                :disabled="arquivandoId === ficha.id"
                @click="arquivarFicha(ficha)"
              >
                Arquivar
              </button>
            </div>
          </div>
          <div v-if="ficha.observacoes" class="exercise-obs" style="margin-bottom: 14px;">{{ ficha.observacoes }}</div>
          <FichaGruposLeitura :grupos="ficha.grupos" />
        </div>
        <div v-if="!fichasAtivas.length" class="card empty-state" style="margin-bottom: 26px;">
          <div class="empty-state-icon">📋</div>Nenhuma ficha de treino ativa ainda.
        </div>

        <p class="rotulo-secao">Fichas anteriores</p>
        <div v-if="!historico.length" class="card empty-state">Nenhuma ficha anterior.</div>
        <div class="registros-list">
          <div v-for="ficha in historico" :key="ficha.id" class="card registro-card row-clickable" @click="alternarExpandido(ficha)">
            <div class="registro-card-head">
              <div class="registro-card-who">
                <span class="list-row-title">{{ ficha.nome || 'Ficha de treino' }}</span>
                <span class="list-row-sub">Criada em {{ formatarData(ficha.created_at) }} · {{ contarExercicios(ficha) }} exercício(s)</span>
              </div>
              <span class="badge badge-neutral">{{ SITUACAO_INATIVA[situacaoInativa(ficha, fichas)] }}</span>
            </div>
            <div v-if="expandidoId === ficha.id" class="transcript-box open" style="font-style: normal;" @click.stop>
              <FichaGruposLeitura :grupos="ficha.grupos" />
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="card card-pad">
          <div style="font-size: 15px; font-weight: 700; margin-bottom: 14px;">
            {{ fichaSubstituida ? `Nova versão de “${fichaSubstituida.nome || 'Ficha de treino'}”` : 'Nova ficha' }}
          </div>
          <p v-if="!fichaSubstituida && fichasAtivas.length" class="list-row-sub" style="margin: -8px 0 14px;">
            Fica ativa junto com {{ fichasAtivas.map((f) => `“${f.nome || 'Ficha de treino'}”`).join(', ') }}.
            Para trocar uma ficha existente, use “Editar” nela.
          </p>
          <div class="form-field" style="max-width: 420px; margin-bottom: 12px;">
            <label>Nome da ficha</label>
            <input v-model="formNome" type="text" placeholder="Ex.: Treino A - Superiores" />
          </div>
          <div class="form-field" style="max-width: 420px; margin-bottom: 20px;">
            <label>Observações (opcional)</label>
            <textarea v-model="formObservacoes" rows="2"></textarea>
          </div>

          <FichaTreinoEditor v-model:grupos="gruposForm" :catalogo="catalogo" @exercicio-criado="(e) => catalogo.push(e)" />

          <div class="revisao-actions">
            <button type="button" class="btn btn-ghost" @click="cancelarEdicao">Cancelar</button>
            <button type="button" class="btn btn-primary" :disabled="salvando || !gruposForm.length" @click="salvarNovaVersao">Salvar ficha</button>
          </div>
        </div>
      </template>
      </template>
    </template>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.secao-cabecalho {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.secao-titulo {
  font-size: 17px;
  font-weight: 800;
}
.dispensa-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}
.dispensa-toggle input {
  width: 15px;
  height: 15px;
  cursor: pointer;
  accent-color: var(--color-primary);
}
.ficha-cabecalho {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.ficha-acoes {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rotulo-secao {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-faint);
  text-transform: uppercase;
  letter-spacing: .03em;
  margin: 8px 0 10px;
}
</style>
