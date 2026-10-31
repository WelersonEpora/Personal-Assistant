<script setup>
import { ref, computed, onMounted } from 'vue'
import exerciciosService from '../services/exercicios.service.js'
import fichasTreinoService from '../services/fichasTreino.service.js'
import alunosService from '../services/alunos.service.js'
import { formatarData } from '../utils/registroStatus.js'
import {
  TIPOS_GRUPO,
  tiposPermitidos,
  ehConjugado,
  itemDoExercicio,
  grupoSimples,
  formularioDaFicha,
  conjugarComProximo,
  separarGrupo,
  removerItem as removerItemDosGrupos,
  moverGrupo as moverGrupoNaLista,
  moverItem as moverItemNoGrupo,
  payloadDosGrupos,
  problemaDoFormulario,
  rotuloPosicao,
  contarExercicios,
  situacaoInativa,
  ordenarPorNome
} from '../utils/fichaTreino.js'
import { useToasts } from '../composables/useToasts.js'
import { useConfirm } from '../composables/useConfirm.js'
import ToastStack from './ToastStack.vue'
import ExercicioMidia from './ExercicioMidia.vue'
import FichaGruposLeitura from './FichaGruposLeitura.vue'
import BuscaExercicio from './BuscaExercicio.vue'

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

function adicionarExercicio(exercicio) {
  gruposForm.value = [...gruposForm.value, grupoSimples(itemDoExercicio(exercicio))]
}

function conjugar(indice) {
  gruposForm.value = conjugarComProximo(gruposForm.value, indice)
}

function separar(indice) {
  gruposForm.value = separarGrupo(gruposForm.value, indice)
}

function removerItem(indiceGrupo, indiceItem) {
  gruposForm.value = removerItemDosGrupos(gruposForm.value, indiceGrupo, indiceItem)
}

function moverGrupo(indice, direcao) {
  gruposForm.value = moverGrupoNaLista(gruposForm.value, indice, direcao)
}

function moverItem(indiceGrupo, indiceItem, direcao) {
  gruposForm.value = moverItemNoGrupo(gruposForm.value, indiceGrupo, indiceItem, direcao)
}

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

          <div v-if="!gruposForm.length" class="empty-state" style="padding: 24px;">Nenhum exercício adicionado ainda.</div>

          <template v-for="(grupo, gi) in gruposForm" :key="grupo.chave">
            <!-- Exercício simples: séries, repetições, descanso e carga no próprio cartão. -->
            <div v-if="!ehConjugado(grupo)" class="exercise-card">
              <div class="exercise-card-top">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span class="posicao">{{ rotuloPosicao(grupo, gi, 0) }}</span>
                  <ExercicioMidia
                    :exercicio-id="grupo.itens[0].exercicioId"
                    :tem-inicio="grupo.itens[0].temImagemInicio"
                    :tem-fim="grupo.itens[0].temImagemFim"
                    :video-url="grupo.itens[0].midiaVideoUrl"
                    :instrucoes="grupo.itens[0].instrucoes"
                    :nome="grupo.itens[0].nome"
                    size="md"
                  />
                  <div>
                    <div class="exercise-name">{{ grupo.itens[0].nome }}</div>
                    <div class="exercise-meta">{{ grupo.itens[0].grupoMuscular }}</div>
                  </div>
                </div>
                <button type="button" class="exercise-remove" @click="removerItem(gi, 0)">Remover</button>
              </div>
              <div class="field-row">
                <div class="field-group">
                  <label>Séries</label>
                  <input v-model="grupo.series" type="number" min="1" />
                </div>
                <div class="field-group">
                  <label>Repetições ou tempo</label>
                  <input v-model="grupo.itens[0].repeticoes" type="text" placeholder="Ex.: 12 ou 30s" />
                </div>
                <div class="field-group">
                  <label>Descanso</label>
                  <input v-model="grupo.descanso" type="text" placeholder="Ex.: 60s" />
                </div>
                <div class="field-group obs-field">
                  <label>Carga / observações</label>
                  <input v-model="grupo.itens[0].cargaObs" type="text" placeholder="Ex.: 20kg, aumentar progressivamente" />
                </div>
              </div>
              <div class="grupo-acoes">
                <button type="button" class="btn btn-ghost btn-sm" :disabled="gi === 0" @click="moverGrupo(gi, -1)">↑ Subir</button>
                <button type="button" class="btn btn-ghost btn-sm" :disabled="gi === gruposForm.length - 1" @click="moverGrupo(gi, 1)">↓ Descer</button>
                <button
                  v-if="gi < gruposForm.length - 1"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  title="Fazer este exercício em sequência com o próximo (bi-set, tri-set, circuito)"
                  @click="conjugar(gi)"
                >
                  🔗 Conjugar com o próximo
                </button>
              </div>
            </div>

            <!-- Grupo conjugado: tipo, voltas e descanso entre voltas valem para o grupo todo. -->
            <div v-else class="grupo-conjugado">
              <div class="field-row">
                <div class="field-group">
                  <label>Tipo</label>
                  <select v-model="grupo.tipo">
                    <option v-for="tipo in tiposPermitidos(grupo.itens.length)" :key="tipo" :value="tipo">{{ TIPOS_GRUPO[tipo] }}</option>
                  </select>
                </div>
                <div class="field-group">
                  <label>Voltas</label>
                  <input v-model="grupo.series" type="number" min="1" />
                </div>
                <div class="field-group">
                  <label>Descanso entre voltas</label>
                  <input v-model="grupo.descanso" type="text" placeholder="Ex.: 60s" />
                </div>
                <div class="field-group obs-field">
                  <label>Observações do grupo</label>
                  <input v-model="grupo.observacoes" type="text" placeholder="Ex.: na 2ª volta, 10 repetições no supino" />
                </div>
              </div>

              <div v-for="(item, ii) in grupo.itens" :key="item.chave" class="grupo-item-edicao">
                <div class="exercise-card-top" style="margin-bottom: 0;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <span class="posicao">{{ rotuloPosicao(grupo, gi, ii) }}</span>
                    <ExercicioMidia
                      :exercicio-id="item.exercicioId"
                      :tem-inicio="item.temImagemInicio"
                      :tem-fim="item.temImagemFim"
                      :video-url="item.midiaVideoUrl"
                      :instrucoes="item.instrucoes"
                      :nome="item.nome"
                    />
                    <div class="exercise-name">{{ item.nome }}</div>
                  </div>
                  <div style="display: flex; gap: 4px; align-items: center;">
                    <button type="button" class="btn btn-ghost btn-sm" :disabled="ii === 0" title="Subir no grupo" @click="moverItem(gi, ii, -1)">↑</button>
                    <button type="button" class="btn btn-ghost btn-sm" :disabled="ii === grupo.itens.length - 1" title="Descer no grupo" @click="moverItem(gi, ii, 1)">↓</button>
                    <button type="button" class="exercise-remove" @click="removerItem(gi, ii)">Remover</button>
                  </div>
                </div>
                <div class="field-row item-campos">
                  <div class="field-group">
                    <label>Repetições ou tempo</label>
                    <input v-model="item.repeticoes" type="text" placeholder="Ex.: 12 ou 30s" />
                  </div>
                  <div class="field-group">
                    <label>Carga / observações</label>
                    <input v-model="item.cargaObs" type="text" placeholder="Ex.: 20kg" />
                  </div>
                </div>
              </div>

              <div class="grupo-acoes">
                <button type="button" class="btn btn-ghost btn-sm" :disabled="gi === 0" @click="moverGrupo(gi, -1)">↑ Subir</button>
                <button type="button" class="btn btn-ghost btn-sm" :disabled="gi === gruposForm.length - 1" @click="moverGrupo(gi, 1)">↓ Descer</button>
                <button v-if="gi < gruposForm.length - 1" type="button" class="btn btn-ghost btn-sm" @click="conjugar(gi)">
                  🔗 Incluir o próximo
                </button>
                <button type="button" class="btn btn-ghost btn-sm" @click="separar(gi)">Separar exercícios</button>
              </div>
            </div>
          </template>

          <div class="form-field" style="margin-top: 8px; max-width: 560px;">
            <label>Adicionar exercício do catálogo</label>
            <BuscaExercicio :catalogo="catalogo" @selecionar="adicionarExercicio" />
          </div>
          <p class="list-row-sub" style="margin-top: 8px;">
            Para um bi-set, tri-set ou circuito, adicione os exercícios em sequência e use “Conjugar com o próximo”.
          </p>

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
.posicao {
  flex: none;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.grupo-conjugado {
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-md);
  padding: 4px 18px 14px;
  margin-bottom: 12px;
  background: var(--color-surface);
}
.grupo-item-edicao {
  border-top: 1px dashed var(--color-border);
  margin-top: 12px;
  padding-top: 12px;
}
.item-campos {
  grid-template-columns: 1fr 2fr;
}
.grupo-acoes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
