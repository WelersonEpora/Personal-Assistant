<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import registrosService from '../../services/registros.service.js'
import exerciciosService from '../../services/exercicios.service.js'
import fichasTreinoService from '../../services/fichasTreino.service.js'
import { corParaId, iniciais, formatarData, formatarHora, resumoEntradas } from '../../utils/registroStatus.js'
import {
  formularioDaProposta,
  payloadDosGrupos,
  problemaDoFormulario,
  contarSemExercicio,
  sugerirSubstituicao
} from '../../utils/fichaTreino.js'
import { useToasts } from '../../composables/useToasts.js'
import { useConfirm } from '../../composables/useConfirm.js'
import FichaTreinoEditor from '../FichaTreinoEditor.vue'
import ToastStack from '../ToastStack.vue'

// docs/adr/0028-ficha-de-treino-por-captura-e-ia.md: revisão da PROPOSTA da IA
// para um Registro tipo ficha_treino. Uma seção por ficha ditada, cada uma no
// mesmo editor da ficha manual, com "Nova ficha" / "Substituir" (sugerido pelo
// nome). Confirmar cria TODAS as fichas pelo endpoint
// /confirmar-ficha-treino - ou nenhuma. Não cria `validacao`.
const props = defineProps({ registro: { type: Object, required: true } })
const emit = defineEmits(['processado'])

const { toasts, showToast } = useToasts()
const { confirmar: confirmarDialog } = useConfirm()

const catalogo = ref([])
const fichasAtivas = ref([])
const fichasForm = ref([])
const carregando = ref(true)
const confirmando = ref(false)
const refazendo = ref(false)
const entradasAbertas = ref(false)

const proposta = computed(() => props.registro.propostaFichaTreino || null)
const fichasPropostas = computed(() => (Array.isArray(proposta.value?.payload_json?.fichas) ? proposta.value.payload_json.fichas : []))
const avisos = computed(() => proposta.value?.avisos_json || [])

let sequencia = 0
function fichaVazia(nome = '') {
  sequencia += 1
  return { chave: `f${sequencia}`, nome, observacoes: '', substituiFichaId: null, grupos: [] }
}

onMounted(async () => {
  try {
    const alunoId = props.registro.aluno_id || props.registro.aluno?.id
    const [dadosCatalogo, dadosAtivas] = await Promise.all([
      exerciciosService.listar(),
      fichasTreinoService.listarAtivas(alunoId)
    ])
    catalogo.value = dadosCatalogo.filter((e) => e.ativo)
    fichasAtivas.value = dadosAtivas
    const porId = new Map(catalogo.value.map((e) => [e.id, e]))
    fichasForm.value = fichasPropostas.value.length
      ? fichasPropostas.value.map((ficha) => ({
          ...fichaVazia(ficha.nome || ''),
          observacoes: ficha.observacoes || '',
          substituiFichaId: sugerirSubstituicao(ficha.nome, dadosAtivas),
          grupos: formularioDaProposta(ficha, porId)
        }))
      : [fichaVazia()]
  } catch (_err) {
    showToast('Não foi possível carregar o catálogo de exercícios e as fichas do aluno.', 'warning')
  } finally {
    carregando.value = false
  }
})

const totalExercicios = computed(() => fichasForm.value.reduce((t, f) => t + f.grupos.reduce((s, g) => s + g.itens.length, 0), 0))
const totalSemExercicio = computed(() => fichasForm.value.reduce((t, f) => t + contarSemExercicio(f.grupos), 0))

// Primeiro problema que impede confirmar - mostrado ao lado do botão.
const problema = computed(() => {
  for (const [indice, ficha] of fichasForm.value.entries()) {
    const p = problemaDoFormulario({ nome: ficha.nome, grupos: ficha.grupos })
    if (p) return fichasForm.value.length > 1 ? `Ficha ${indice + 1}: ${p}` : p
  }
  const substituidas = fichasForm.value.map((f) => f.substituiFichaId).filter(Boolean)
  if (new Set(substituidas).size !== substituidas.length) return 'Duas fichas não podem substituir a mesma ficha ativa.'
  return null
})

function nomeDaAtiva(id) {
  return fichasAtivas.value.find((f) => f.id === id)?.nome || 'Ficha de treino'
}

function adicionarFicha() {
  fichasForm.value = [...fichasForm.value, fichaVazia()]
}

async function removerFicha(indice) {
  const ficha = fichasForm.value[indice]
  if (ficha.grupos.length) {
    const ok = await confirmarDialog({
      titulo: `Tirar “${ficha.nome || `Ficha ${indice + 1}`}” desta revisão?`,
      mensagem: 'Os exercícios dela não serão salvos.',
      confirmarLabel: 'Tirar'
    })
    if (!ok) return
  }
  fichasForm.value = fichasForm.value.filter((_, i) => i !== indice)
}

function adicionarAoCatalogo(exercicio) {
  catalogo.value = [...catalogo.value, exercicio]
}

async function alternarEntradas() {
  entradasAbertas.value = !entradasAbertas.value
  if (!entradasAbertas.value) return
  await Promise.all(
    (props.registro.entradas || [])
      .filter((e) => e.tipo === 'audio' && e.arquivoAudio && !e.audioUrl)
      .map(async (e) => {
        try {
          const blob = await registrosService.obterAudio(props.registro.id, e.id)
          e.audioUrl = URL.createObjectURL(blob)
        } catch (_err) {
          // sem áudio - a entrada fica só sem player
        }
      })
  )
}

onBeforeUnmount(() => {
  ;(props.registro.entradas || []).forEach((e) => {
    if (e.audioUrl) URL.revokeObjectURL(e.audioUrl)
  })
})

async function confirmar() {
  if (problema.value) {
    showToast(problema.value, 'warning')
    return
  }
  confirmando.value = true
  try {
    await registrosService.confirmarFichaTreino(props.registro.id, {
      fichas: fichasForm.value.map((ficha) => ({
        nome: ficha.nome.trim(),
        observacoes: ficha.observacoes.trim() || null,
        substituiFichaId: ficha.substituiFichaId || null,
        grupos: payloadDosGrupos(ficha.grupos)
      }))
    })
    const quantas = fichasForm.value.length
    showToast(`${quantas === 1 ? 'Ficha salva' : `${quantas} fichas salvas`} para ${props.registro.aluno?.nome}.`, 'success')
    emit('processado')
  } catch (err) {
    showToast(err.response?.data?.error?.message || 'Não foi possível salvar as fichas.', 'warning')
  } finally {
    confirmando.value = false
  }
}

async function refazerInterpretacao() {
  const ok = await confirmarDialog({
    titulo: 'Refazer a interpretação da IA?',
    mensagem: 'A proposta atual é substituída por uma nova. Suas edições nesta tela se perdem.'
  })
  if (!ok) return
  refazendo.value = true
  try {
    await registrosService.reprocessar(props.registro.id)
    showToast('Interpretação reenviada. Acompanhe na fila.', 'neutral')
    emit('processado')
  } catch (_err) {
    showToast('Não foi possível refazer a interpretação.', 'warning')
  } finally {
    refazendo.value = false
  }
}

async function descartar() {
  const ok = await confirmarDialog({
    titulo: 'Descartar esta ficha ditada?',
    mensagem: 'O registro e o áudio são removidos. Nenhuma ficha é criada. Essa ação não pode ser desfeita.',
    perigo: true,
    confirmarLabel: 'Descartar'
  })
  if (!ok) return
  try {
    await registrosService.excluir(props.registro.id)
    showToast('Ficha ditada descartada.', 'neutral')
    emit('processado')
  } catch (_err) {
    showToast('Não foi possível descartar.', 'warning')
  }
}
</script>

<template>
  <div class="card revisao-card">
    <div class="detail-header" style="margin-bottom: 14px;">
      <span class="avatar sz-md" :style="{ background: corParaId(registro.aluno?.id) }">{{ iniciais(registro.aluno?.nome) }}</span>
      <div>
        <div class="detail-header-name" style="font-size: 16px;">{{ registro.aluno?.nome }} — Ficha de treino</div>
        <div class="detail-header-sub">
          Proposta da IA · registro de {{ formatarData(registro.created_at) }} às {{ formatarHora(registro.iniciado_em) }}
        </div>
      </div>
    </div>

    <div v-if="proposta && proposta.status !== 'concluido'" class="ft-rev-alerta danger">
      A interpretação falhou{{ proposta.erro ? `: ${proposta.erro}` : '.' }} Use “Refazer interpretação”.
    </div>

    <!-- painel de conferência -->
    <div class="ft-rev-conferencia">
      <div class="ft-rev-conf-linha">
        <span class="ft-rev-conf-rot">Proposta</span>
        <span>
          {{ fichasForm.length }} ficha(s) · {{ totalExercicios }} exercício(s)<template v-if="totalSemExercicio">
            · <strong class="ft-rev-pendente">{{ totalSemExercicio }} não reconhecido(s)</strong></template>
        </span>
      </div>
      <div v-if="avisos.length" class="ft-rev-avisos">
        <div class="ft-rev-conf-rot">A IA avisou</div>
        <div v-for="(aviso, i) in avisos" :key="i" class="ft-rev-aviso">{{ aviso }}</div>
      </div>

      <div class="revisao-source">
        {{ resumoEntradas(registro.entradas || []) }} neste registro
        <button class="revisao-source-toggle" type="button" @click="alternarEntradas">
          {{ entradasAbertas ? 'Ocultar entradas originais' : 'Ver entradas originais' }}
        </button>
      </div>
      <div class="transcript-box" :class="{ open: entradasAbertas }">
        <div v-for="entrada in registro.entradas" :key="entrada.id" class="source-entry">
          <span class="source-entry-icon">{{ entrada.tipo === 'audio' ? '🎙️' : '⌨️' }}</span>
          <div class="source-entry-body">
            <div class="source-entry-meta">{{ entrada.tipo === 'audio' ? `Áudio · ${entrada.duracao_segundos || '?'}s` : 'Texto' }}</div>
            <audio v-if="entrada.audioUrl" :src="entrada.audioUrl" controls class="source-entry-audio"></audio>
            <div class="source-entry-text">
              <template v-if="entrada.tipo === 'audio'">
                <template v-if="entrada.arquivoAudio?.transcricao?.texto">“{{ entrada.arquivoAudio.transcricao.texto }}”</template>
                <span v-else style="font-style: normal; color: var(--color-text-faint);">Transcrição não disponível.</span>
              </template>
              <template v-else>“{{ entrada.conteudo_texto }}”</template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="carregando" class="empty-state">Carregando catálogo…</div>

    <template v-else>
      <p v-if="!fichasPropostas.length" class="ft-rev-alerta">
        A IA não extraiu nenhuma ficha deste registro. Monte abaixo, refaça a interpretação ou descarte.
      </p>

      <div v-for="(ficha, indice) in fichasForm" :key="ficha.chave" class="ft-rev-ficha">
        <div class="ft-rev-ficha-cab">
          <span class="ft-rev-ficha-num">Ficha {{ indice + 1 }}</span>
          <button v-if="fichasForm.length > 1" type="button" class="btn btn-ghost btn-sm" @click="removerFicha(indice)">Tirar esta ficha</button>
        </div>
        <div class="field-row ft-rev-ficha-campos">
          <div class="field-group">
            <label>Nome da ficha</label>
            <input v-model="ficha.nome" type="text" placeholder="Ex.: Treino A - Superiores" />
          </div>
          <div class="field-group">
            <label>Salvar como</label>
            <select v-model="ficha.substituiFichaId">
              <option :value="null">Nova ficha (soma às ativas)</option>
              <option v-for="ativa in fichasAtivas" :key="ativa.id" :value="ativa.id">Substituir “{{ ativa.nome || 'Ficha de treino' }}”</option>
            </select>
            <span v-if="ficha.substituiFichaId" class="field-hint">
              “{{ nomeDaAtiva(ficha.substituiFichaId) }}” vai para o histórico e esta passa a ser a versão ativa.
            </span>
          </div>
          <div class="field-group" style="grid-column: 1 / -1;">
            <label>Observações (opcional)</label>
            <textarea v-model="ficha.observacoes" rows="2"></textarea>
          </div>
        </div>

        <FichaTreinoEditor v-model:grupos="ficha.grupos" :catalogo="catalogo" @exercicio-criado="adicionarAoCatalogo" />
      </div>

      <button type="button" class="btn btn-ghost" style="margin-bottom: 8px;" @click="adicionarFicha">+ Adicionar outra ficha</button>

      <div class="revisao-actions">
        <button class="btn btn-primary" type="button" :disabled="confirmando || Boolean(problema)" @click="confirmar">
          {{ fichasForm.length > 1 ? `Salvar ${fichasForm.length} fichas` : 'Salvar ficha' }}
        </button>
        <button class="btn btn-secondary" type="button" :disabled="refazendo || confirmando" @click="refazerInterpretacao">
          Refazer interpretação
        </button>
        <button class="btn btn-danger-ghost" type="button" style="margin-left: auto;" :disabled="confirmando" @click="descartar">
          Descartar
        </button>
      </div>
      <p v-if="problema" class="ft-rev-problema">{{ problema }}</p>
    </template>

    <ToastStack :toasts="toasts" />
  </div>
</template>

<style scoped>
.ft-rev-conferencia {
  border: 1px solid var(--color-ficha);
  background: var(--color-ficha-light);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ft-rev-conf-linha { display: flex; gap: 10px; font-size: 13px; align-items: baseline; }
.ft-rev-conf-rot {
  font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em;
  color: var(--color-ficha-dark); flex: none; min-width: 96px;
}
.ft-rev-pendente { color: var(--color-warning); }
.ft-rev-avisos {
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: flex; flex-direction: column; gap: 3px;
}
.ft-rev-aviso { font-size: 12.5px; color: var(--color-text-secondary); }
.ft-rev-alerta {
  font-size: 12.5px; color: var(--color-warning);
  background: var(--color-warning-light);
  padding: 10px 12px; border-radius: var(--radius-sm);
  margin-bottom: 14px;
}
.ft-rev-alerta.danger { color: var(--color-danger); background: var(--color-danger-light); }
.ft-rev-ficha {
  border-top: 2px solid var(--color-ficha-light);
  padding-top: 16px;
  margin-bottom: 22px;
}
.ft-rev-ficha-cab { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.ft-rev-ficha-num {
  font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em;
  color: var(--color-ficha-dark);
}
.ft-rev-ficha-campos { grid-template-columns: 1fr 1fr; margin-bottom: 16px; }
.field-hint { display: block; margin-top: 4px; font-size: 11.5px; color: var(--color-text-faint); }
.ft-rev-problema { font-size: 12px; color: var(--color-warning); margin-top: 8px; text-align: right; }

@media (max-width: 760px) {
  .revisao-card { padding: 16px 14px; }
  .ft-rev-conferencia { padding: 12px 12px; }
  .ft-rev-conf-linha { flex-direction: column; gap: 2px; }
  .ft-rev-conf-rot { min-width: 0; }
  .ft-rev-ficha-campos { grid-template-columns: 1fr; }
}
</style>
